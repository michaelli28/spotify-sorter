"use client";
import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { EASE_OUT } from "@/src/components/design/motion";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

/**
 * The scan's title while it counts: "12 of 40 / playlists read". The count
 * ticks (800ms EASE_OUT per update, brief §4.4 A); assistive tech gets the
 * true figure, never the ticking one.
 */
export function PlaylistsRead({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const { reduced } = useMotionConfig();
  // Reduced: no "0 of N" frame before the effect's first jump.
  const shown = useMotionValue(reduced ? done : 0);
  const digits = useTransform(shown, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    if (reduced) {
      shown.jump(done);
      return;
    }
    const controls = animate(shown, done, { duration: 0.8, ease: EASE_OUT });
    return () => controls.stop();
  }, [done, reduced, shown]);

  const of = ` of ${total.toLocaleString()}`;
  return (
    <>
      <span className="sr-only">{`${done.toLocaleString()}${of}`}</span>
      <span aria-hidden="true" className="num block">
        <motion.span>{digits}</motion.span>
        {of}
      </span>{" "}
      <span className="block">
        {`${total === 1 ? "playlist" : "playlists"} read`}
      </span>
    </>
  );
}
