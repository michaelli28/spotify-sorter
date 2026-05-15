"use client";
import { forwardRef, type InputHTMLAttributes } from "react";
import clsx from "clsx";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, id, className, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={clsx(
          "w-full bg-transparent px-1 py-2",
          "text-base text-[var(--color-text-primary)]",
          "border-b border-[var(--color-border-default)]",
          "focus:outline-none focus:border-[var(--color-accent)]",
          "transition-colors duration-200",
          className,
        )}
        {...rest}
      />
    </div>
  );
});
