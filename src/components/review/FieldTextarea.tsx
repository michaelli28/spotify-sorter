"use client";
import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import clsx from "clsx";

// field-sizing grows the box with its text where supported; elsewhere the
// height follows scrollHeight on each change.
const SIZES_ITSELF =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("field-sizing", "content");

export interface FieldTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "rows"
> {
  value: string;
  onValueChange: (value: string) => void;
  /** Enter never adds a newline: each field is one line of the classify prompt. */
  onEnter?: () => void;
  onEscape?: () => void;
  face: "display" | "body";
  invalid?: boolean;
}

/** A borderless field that wraps instead of clipping, with a bottom rule. */
export function FieldTextarea({
  value,
  onValueChange,
  onEnter,
  onEscape,
  face,
  invalid,
  className,
  onKeyDown,
  ...rest
}: FieldTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || SIZES_ITSELF) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter?.();
    } else if (e.key === "Escape" && onEscape) {
      e.preventDefault();
      onEscape();
    }
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(e) => onValueChange(e.target.value.replace(/\s*\n\s*/g, " "))}
      onKeyDown={handleKey}
      className={clsx(
        "block w-full min-w-0 resize-none bg-transparent px-0 py-1 [field-sizing:content]",
        "border-b transition-colors duration-200 focus:outline-none",
        "placeholder:text-[var(--color-text-tertiary)]",
        invalid
          ? "border-[var(--color-danger)]"
          : "border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]",
        "focus:border-[var(--color-accent)]",
        face === "display"
          ? "font-[family-name:var(--font-display)] text-xl leading-tight tracking-tight text-[var(--color-text-primary)] md:text-2xl"
          : "text-sm leading-relaxed text-[var(--color-text-secondary)] focus:text-[var(--color-text-primary)]",
        className,
      )}
      {...rest}
    />
  );
}
