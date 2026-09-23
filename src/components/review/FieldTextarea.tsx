"use client";
import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import clsx from "clsx";
import { controlClass } from "@/src/components/design/Input";

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

/**
 * A one-line field that wraps instead of clipping: a name in Caprasimo on a
 * dotted rule ("display"), or a description on a ruled index card ("body").
 */
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
        "block min-w-0 resize-none [field-sizing:content] placeholder:text-ink-3",
        controlClass({
          kind: face === "display" ? "display" : "ruled",
          invalid,
        }),
        face === "display" && "leading-[1.12] max-tab:text-lead",
        className,
      )}
      {...rest}
    />
  );
}
