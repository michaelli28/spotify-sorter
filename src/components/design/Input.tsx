"use client";
import { forwardRef, useId, type InputHTMLAttributes } from "react";
import clsx from "clsx";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Shown under the field in danger ink and announced; marks it invalid. */
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className, "aria-describedby": describedBy, ...rest },
  ref,
) {
  const fallbackId = useId();
  const inputId = id ?? rest.name ?? fallbackId;
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="eyebrow">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={clsx(describedBy, error && errorId) || undefined}
        className={clsx(
          "w-full bg-transparent px-1 py-2",
          "text-base text-[var(--color-text-primary)]",
          "border-b focus:border-[var(--color-accent)] focus:outline-none",
          error
            ? "border-[var(--color-danger)]"
            : "border-[var(--color-border-default)]",
          "transition-colors duration-200",
          className,
        )}
        {...rest}
      />
      {error && (
        <p
          id={errorId}
          role="alert"
          className="px-1 text-sm text-[var(--color-danger)]"
        >
          {error}
        </p>
      )}
    </div>
  );
});
