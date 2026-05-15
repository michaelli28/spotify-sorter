"use client";
import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function PageShell({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
}) {
  return (
    <main className="min-h-screen px-12 py-16 max-w-5xl mx-auto">
      {(eyebrow || title) && (
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16"
        >
          {eyebrow && (
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-3">
              {eyebrow}
            </div>
          )}
          {title && (
            <h1 className="font-[family-name:var(--font-display)] text-5xl text-[var(--color-text-primary)] tracking-tight">
              {title}
            </h1>
          )}
        </motion.header>
      )}
      {children}
    </main>
  );
}
