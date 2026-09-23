import type { HTMLAttributes } from "react";
import clsx from "clsx";

/** The card surface, for surfaces that can't be a <Card> (motion, dnd-kit). */
export function surfaceClass(interactive = false): string {
  return clsx(
    "bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] p-panel",
    // Hover feedback promises a click; only surfaces that take one get it.
    interactive &&
      "transition-colors duration-200 hover:border-[var(--color-border-strong)]",
  );
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ interactive = false, className, ...rest }: CardProps) {
  return (
    <div className={clsx(surfaceClass(interactive), className)} {...rest} />
  );
}
