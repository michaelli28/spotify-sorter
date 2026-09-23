// No "use client": server components (app/page.tsx) call buttonClass(), and a
// function exported from a client module can't be called on the server.
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentProps,
} from "react";
import Link from "next/link";
import clsx from "clsx";

export type ButtonVariant = "primary" | "ghost" | "danger";
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

// ::after on the element itself, so hovering anywhere on the label grows it
// and a plain <a> styled with buttonClass() gets the same underline.
const UNDERLINE = [
  "after:absolute after:inset-x-1 after:h-px after:origin-left after:scale-x-40",
  "after:transition-transform after:duration-250 after:ease-out-expo",
  "motion-reduce:after:transition-none",
  "hover:after:scale-x-100 focus-visible:after:scale-x-100",
  "disabled:after:hidden",
];

export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: ButtonClassOptions = {}): string {
  const underlined = variant !== "ghost";
  return clsx(
    "relative inline-flex items-baseline gap-1 px-1 font-medium tracking-tight",
    "transition-colors duration-200",
    "disabled:cursor-not-allowed disabled:opacity-50",
    size === "md" ? "py-2 text-base" : "py-1.5 text-sm",
    underlined && UNDERLINE,
    underlined && (size === "md" ? "after:bottom-1" : "after:bottom-0.5"),
    variant === "primary" &&
      "text-[var(--color-text-primary)] after:bg-[var(--color-accent)]",
    variant === "danger" &&
      "text-[var(--color-danger)] after:bg-[var(--color-danger)]",
    variant === "ghost" &&
      "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", type = "button", className, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        data-variant={variant}
        className={buttonClass({ variant, size, className })}
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
