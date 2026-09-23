"use client";
import { MotionConfig, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SPRING, useMotionConfig } from "@/src/hooks/useMotionConfig";

// Fade-in only, never AnimatePresence: an exit rendered the next page inside
// the outgoing wrapper, so pages mounted twice and the scan stream ran twice.
// MotionConfig: the brief's spring by default; no transforms if reduced.
// initial stays opacity 0 when reduced (the server can't see the preference;
// initial={false} broke hydration) and the fade goes instant instead.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { pageEase } = useMotionConfig();
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={pageEase}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
