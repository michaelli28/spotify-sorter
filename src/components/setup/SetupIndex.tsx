"use client";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

// Read-only, like the site nav's steps (hidden on /setup): only Back moves
// backwards, so values typed on a later step are never skipped past.
export function SetupIndex({
  steps,
  current,
}: {
  steps: readonly string[];
  current: number;
}) {
  const { spring } = useMotionConfig();
  return (
    <ol
      aria-label="Setup"
      className="flex gap-6 font-[family-name:var(--font-mono)] text-sm lg:flex-col lg:gap-4 lg:pt-4"
    >
      {steps.map((label, i) => {
        const isCurrent = i === current;
        return (
          <li
            key={label}
            aria-current={isCurrent ? "step" : undefined}
            className={clsx(
              "transition-colors duration-200",
              isCurrent
                ? "text-[var(--color-text-primary)]"
                : "text-[var(--color-text-tertiary)]",
            )}
          >
            <span className="relative inline-flex gap-4">
              <span className="tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              {/* Below lg the step's title names it; the number is enough. */}
              <span className="max-lg:sr-only font-[family-name:var(--font-body)]">
                {label}
              </span>
              {isCurrent && (
                <motion.span
                  layoutId="setup-step"
                  transition={spring}
                  className="absolute inset-x-0 -bottom-1.5 h-px bg-[var(--color-text-primary)]"
                />
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
