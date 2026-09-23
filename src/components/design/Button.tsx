// No "use client": server components (app/page.tsx) call buttonClass(), and a
// function exported from a client module can't be called on the server.
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
} from "react";
import Link from "next/link";
import clsx from "clsx";

/**
 * primary: the view's one orange action. quiet: underlined ink text. ghost:
 * quiet in ink-2 (the brief's .is-2). danger: quiet in danger. danger-confirm:
 * a dialog's destructive confirm. ink: printed in navy only, for /label, where
 * no orange may sit beside a blind judgement. icon: a 44px circle; give it an
 * aria-label.
 */
export type ButtonVariant =
  | "primary"
  | "quiet"
  | "ghost"
  | "danger"
  | "danger-confirm"
  | "ink"
  | "icon";
export type ButtonSize = "md" | "sm";

/**
 * Routes a button-styled link may open. /scan is absent on purpose: loading it
 * starts a real library read. /review (no categories), /classify and /apply
 * (unsorted tracks) start paid work on load — callers gate those on
 * /api/status, which a type can't express.
 */
export type SafeHref =
  | "/"
  | "/scope"
  | "/review"
  | "/classify"
  | "/apply"
  | "/label";

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

// A block of ink with its keyline printed 4px out of register (::after, so a
// plain <a> styled with buttonClass() gets it too). Hover and focus pull it in.
const PRINTED = [
  "relative isolate inline-flex items-center justify-center whitespace-nowrap rounded-[3px] font-display font-normal tracking-[0.01em]",
  // Room for the keyline, so it ends flush with the column, not 4px past it.
  "mr-1 mb-1",
  "focus-visible:outline-offset-[6px]",
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[3px] after:border-[1.5px] after:content-['']",
  "after:translate-1",
  "not-disabled:hover:after:translate-0 focus-visible:after:translate-0 not-disabled:active:after:translate-0",
  "transition-colors duration-100",
];

// The keyline slides into register; on /label nothing travels, so it snaps.
const SLIDE =
  "after:transition-[translate] after:duration-180 after:ease-out motion-reduce:after:transition-none";

// Disabled fades on every variant, but a busy button keeps its label legible:
// "Checking…" is the only sign that work is running.
const LOCKED =
  "disabled:cursor-not-allowed not-aria-busy:disabled:opacity-50 aria-busy:cursor-progress";

// Underlined text with a 44px target; the underline darkens on hover.
const QUIET = [
  "inline-flex min-h-11 min-w-11 items-center gap-1.5 whitespace-nowrap font-medium",
  "underline decoration-[1.5px] underline-offset-[6px]",
  "transition-[color,text-decoration-color] duration-180 ease-out",
  "disabled:text-ink-3 disabled:decoration-rule",
];

export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: ButtonClassOptions = {}): string {
  const printed =
    variant === "primary" || variant === "danger-confirm" || variant === "ink";
  const quiet =
    variant === "quiet" || variant === "ghost" || variant === "danger";
  return clsx(
    printed && PRINTED,
    printed && variant !== "ink" && SLIDE,
    (printed || quiet) && LOCKED,
    printed &&
      (size === "md" ? "min-h-14 px-8 text-lead" : "min-h-11 px-6 text-body"),
    variant === "primary" &&
      "bg-accent text-on-accent after:border-ink not-disabled:active:bg-accent-press",
    variant === "danger-confirm" &&
      // An inset line, not a border: a border would inset the keyline too.
      "bg-card text-danger shadow-[inset_0_0_0_1.5px_var(--danger)] after:border-danger",
    variant === "ink" &&
      "bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--ink)] after:border-ink after:transition-none not-disabled:active:bg-paper-deep",
    quiet && QUIET,
    quiet && (size === "md" ? "text-body" : "text-sm underline-offset-4"),
    variant === "quiet" &&
      "text-ink decoration-rule-strong hover:decoration-ink",
    variant === "ghost" &&
      "text-ink-2 decoration-rule-strong hover:text-ink hover:decoration-ink",
    variant === "danger" &&
      "text-danger decoration-[color-mix(in_oklab,var(--danger)_45%,var(--paper))] hover:decoration-danger",
    variant === "icon" &&
      "inline-grid size-11 place-items-center rounded-full text-ink transition-colors duration-180 ease-out hover:bg-paper-deep disabled:cursor-not-allowed disabled:text-ink-3 [&_svg]:size-5",
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Work is running: locked like `disabled`, but the label stays legible. */
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      type = "button",
      busy = false,
      className,
      disabled,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        data-variant={variant}
        className={buttonClass({ variant, size, className })}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        {...rest}
      />
    );
  },
);

export type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: SafeHref;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** An in-app link that looks like a Button. Never nest a Button in a Link. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      data-variant={variant}
      className={buttonClass({ variant, size, className })}
      {...rest}
    />
  );
}
