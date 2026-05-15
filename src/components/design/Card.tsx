"use client";
import type { HTMLAttributes } from "react";
import clsx from "clsx";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "bg-[var(--color-bg-surface)]",
        "border border-[var(--color-border-default)]",
        "p-6",
        "transition-colors duration-300",
        "hover:border-[var(--color-border-strong)]",
        className,
      )}
      {...rest}
    />
  );
}
