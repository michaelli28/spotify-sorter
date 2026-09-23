import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ReactNode,
} from "react";
import clsx from "clsx";
import { tabTint } from "@/src/lib/sleeves/inks";
import { TEMPERATURES, type Temperature } from "@/src/lib/sleeves/temperature";

interface TabOwnProps {
  /** 1-based catalogue number, printed as two digits: the category's identity on every page.
   *  null prints no number (a blank slot waiting for a real category). */
  catalogueNo: number | null;
  /** The tint. null prints the dashed blank tab (Add a category, the empty crate). */
  temperature: Temperature | null;
  /** "review": 16px tall. "crate": 18u tall; needs --u from <CrateFigure>. */
  size: "review" | "crate";
  /** The open or current divider: printed reversed and lifted. */
  reversed?: boolean;
  /** Printed in place of the number, e.g. classify's number and live count. */
  children?: ReactNode;
}

export type TabProps = TabOwnProps &
  Omit<ComponentPropsWithoutRef<"span">, keyof TabOwnProps>;

const CRATE: CSSProperties = {
  height: "calc(18 * var(--u))",
  fontSize: "max(11px, calc(12.8 * var(--u)))",
};

/**
 * A divider tab: card stock tinted with the temperature (mixed in OKLab), a 1px keyline
 * open at the bottom, a navy mono catalogue number. It encodes no quantity. Position it
 * yourself; the crate wraps it in its own button (<CrateTab>).
 */
export function Tab({
  catalogueNo,
  temperature,
  size,
  reversed = false,
  children,
  className,
  style,
  ...rest
}: TabProps) {
  const fill = temperature
    ? ({ "--tab-fill": tabTint(temperature) } as CSSProperties)
    : undefined;
  return (
    <span
      {...rest}
      data-reversed={reversed || undefined}
      className={clsx(
        "inline-grid place-items-center rounded-t-[3px] font-[family-name:var(--font-mono)] leading-none",
        "transition-transform duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        size === "review" && "h-4 min-w-10 px-2 text-[0.8rem]",
        size === "crate" && "w-full",
        temperature === null
          ? "border-[1.5px] border-b-0 border-dashed border-[var(--rule-strong)] bg-[var(--paper-deep)] text-[var(--ink-2)]"
          : reversed
            ? "border border-b-0 border-[var(--tab-pressed-edge)] bg-[var(--tab-pressed)] text-[var(--tab-pressed-ink)]"
            : "border border-b-0 border-[var(--rule-strong)] bg-[var(--tab-fill)] text-[var(--tab-ink)]",
        reversed && size === "review" && "-translate-y-[3px]",
        className,
      )}
      style={{
        ...fill,
        ...(size === "crate" ? CRATE : undefined),
        ...(reversed && size === "crate"
          ? { transform: "translateY(calc(-3 * var(--u)))" }
          : undefined),
        ...style,
      }}
    >
      {children ??
        (catalogueNo === null ? null : String(catalogueNo).padStart(2, "0"))}
    </span>
  );
}

/** The one-line key under the crate and in the review bin's column head: what a tab's colour means. */
export function TemperatureKey({
  label = "Tab colours",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={clsx(
        "flex flex-wrap items-center gap-x-3.5 gap-y-0.5 font-[family-name:var(--font-mono)] text-[0.8rem] tracking-[0.02em]",
        className,
      )}
    >
      {TEMPERATURES.map((t) => (
        <li key={t} className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className="h-[11px] w-[14px] rounded-t-[2px] border border-b-0 border-[var(--rule-strong)] bg-[var(--tab-fill)]"
            style={{ "--tab-fill": tabTint(t) } as CSSProperties}
          />
          {t}
        </li>
      ))}
    </ul>
  );
}
