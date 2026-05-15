"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";

type Variant = "primary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        data-variant={variant}
        className={clsx(
          "group relative inline-flex items-baseline gap-1 px-1 py-2",
          "text-base font-medium tracking-tight",
          "text-[var(--color-text-primary)]",
          "transition-colors duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variant === "ghost" &&
            "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
          className,
        )}
        {...rest}
      >
        <span>{children}</span>
        {variant === "primary" && (
          <motion.span
            aria-hidden
            className="absolute inset-x-0 -bottom-0.5 h-px origin-left bg-[var(--color-accent)]"
            initial={{ scaleX: 0.4, opacity: 0.7 }}
            whileHover={{ scaleX: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 30,
              mass: 0.8,
            }}
          />
        )}
      </button>
    );
  },
);
