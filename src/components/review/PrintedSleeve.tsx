"use client";
import { useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  type Variants,
} from "framer-motion";
import clsx from "clsx";
import { Sleeve, registrationShift } from "@/src/components/graphics/Sleeve";
import {
  DURATION,
  EASE_IN,
  EASE_IN_OUT,
  EASE_OUT,
  SPRING_SETTLE,
} from "@/src/components/design/motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";
import type { SleeveSource } from "@/src/lib/sleeves/lexicon";
import { specInCatalogue, type SleeveSpec } from "@/src/lib/sleeves/spec";

/** The open sleeve's morph between its row and the sheet (brief §4.4). */
export const SLEEVE_MORPH = {
  layout: { duration: DURATION.state, ease: EASE_IN_OUT },
} as const;

export const sleeveLayoutId = (id: string) => `sleeve-${id}`;

/** A rename reprints once typing has paused this long (brief §4.1 step 9). */
const RENAME_SETTLE_MS = 400;

function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

export interface PrintedSleeveProps {
  category: SleeveSource;
  /** The saved list: it decides the de-duplicated motif and ink B. */
  catalogue: readonly SleeveSource[];
  size: number;
  className?: string;
}

/**
 * The open category's sleeve. It owns the category's layoutId while open, so
 * the row's sleeve morphs into it. A rename reprints it once typing pauses:
 * the old drum B slides out of register and fades, and the new sleeve prints
 * in as the credits do. A colour change reprints at once.
 */
export function PrintedSleeve({
  category,
  catalogue,
  size,
  className,
}: PrintedSleeveProps) {
  const name = useSettled(category.name, RENAME_SETTLE_MS);
  const spec = useMemo(
    () => specInCatalogue({ ...category, name }, catalogue),
    [category, name, catalogue],
  );
  const printKey = `${spec.seed}:${spec.temp}:${spec.motif}:${spec.inkB}`;
  return (
    <motion.div
      layoutId={sleeveLayoutId(category.id)}
      transition={SLEEVE_MORPH}
      className="relative"
    >
      <AnimatePresence initial={false} mode="popLayout">
        <Print
          key={printKey}
          spec={spec}
          size={size}
          title={`Cover for ${category.name}`}
          className={className}
        />
      </AnimatePresence>
    </motion.div>
  );
}

function Print({
  spec,
  size,
  title,
  className,
}: {
  spec: SleeveSpec;
  size: number;
  title: string;
  className?: string;
}) {
  const present = useIsPresent();
  const { reduced } = useMotionConfig();
  const out = registrationShift(spec, 4);
  const frame: Variants = reduced
    ? {
        print: { opacity: 0 },
        rest: { opacity: 1, transition: { duration: DURATION.reduced } },
        gone: { opacity: 0, transition: { duration: DURATION.reduced } },
      }
    : {
        print: {},
        rest: {},
        gone: { opacity: 0, transition: { duration: 0.16, ease: EASE_IN } },
      };
  // The new print waits for the old one to leave, then prints in two passes.
  const drumA: Variants = {
    print: { opacity: 0, x: -6 },
    rest: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.18, ease: EASE_OUT, delay: 0.16 },
    },
  };
  const drumB: Variants = {
    print: out,
    rest: { x: 0, y: 0, transition: { ...SPRING_SETTLE, delay: 0.16 } },
    gone: { ...out, transition: { duration: 0.16, ease: EASE_IN } },
  };
  return (
    <motion.div
      initial="print"
      animate="rest"
      exit="gone"
      variants={frame}
      // The leaving print is only ink on its way out.
      aria-hidden={present ? undefined : true}
    >
      <Sleeve
        spec={spec}
        size={size}
        title={present ? title : undefined}
        className={clsx("block border-[1.5px] border-ink", className)}
        drumA={reduced ? undefined : { variants: drumA }}
        drumB={reduced ? undefined : { variants: drumB }}
      />
    </motion.div>
  );
}
