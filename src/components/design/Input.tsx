"use client";
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import clsx from "clsx";

/**
 * underline: filters, search, setup fields. display: a category name set in
 * Caprasimo on a dotted rule. ruled: a description on a ruled index card.
 */
export type ControlKind = "underline" | "display" | "ruled";

const CONTROL: Record<ControlKind, string> = {
  underline:
    "w-full border-b-[1.5px] bg-transparent py-2 text-body text-ink placeholder:text-ink-3 focus:shadow-[0_1px_0_0_var(--ink)]",
  display:
    "w-full border-b-[1.5px] border-dotted bg-transparent pb-1.5 font-display text-title text-ink focus:border-solid",
  ruled: "ruled-card w-full rounded-[2px] border px-3 pt-3 pb-2.5 text-ink",
};

export function controlClass({
  kind = "underline",
  invalid = false,
}: { kind?: ControlKind; invalid?: boolean } = {}): string {
  return clsx(
    CONTROL[kind],
    invalid ? "border-danger" : "border-rule-strong",
    // The keyline turning ink is the focus mark, so the outline goes.
    "transition-[border-color,box-shadow] duration-180 ease-out focus:border-ink focus:outline-none",
  );
}

/** Spread onto the control Field wraps. */
export interface FieldControlProps {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

export interface FieldProps {
  label?: ReactNode;
  /** Help that stays under the control. */
  hint?: ReactNode;
  /** Shown under the field in danger ink and announced; marks it invalid. */
  error?: string;
  id?: string;
  /** Ids of other elements that describe the control, kept first. */
  describedBy?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/** Label, hint and error around any control: <Field>{(c) => <textarea {...c} />}</Field>. */
export function Field({
  label,
  hint,
  error,
  id,
  describedBy,
  className,
  children,
}: FieldProps) {
  const fallbackId = useId();
  const controlId = id ?? fallbackId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const described =
    clsx(describedBy, hint != null && hintId, error && errorId) || undefined;
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      {label != null && (
        <label htmlFor={controlId} className="font-semibold text-ink">
          {label}
        </label>
      )}
      {children({
        id: controlId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": described,
      })}
      {hint != null && (
        <p id={hintId} className="text-ink-2">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  /** Shown under the field in danger ink and announced; marks it invalid. */
  error?: string;
}

/** An underline input with its label above. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    id,
    className,
    "aria-describedby": describedBy,
    ...rest
  },
  ref,
) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      id={id ?? rest.name}
      describedBy={describedBy}
    >
      {(control) => (
        <input
          ref={ref}
          {...control}
          className={clsx(controlClass({ invalid: !!error }), className)}
          {...rest}
        />
      )}
    </Field>
  );
});
