import type { HTMLAttributes } from "react";
import clsx from "clsx";

/** Lifted card stock, for surfaces that can't be a <Card> (motion, dnd-kit). */
export function surfaceClass(interactive = false): string {
  return clsx(
    "rounded-[3px] border border-rule-strong bg-card p-panel",
    // Hover feedback promises a click; only surfaces that take one get it.
    interactive &&
      "transition-colors duration-180 ease-out hover:border-ink",
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
