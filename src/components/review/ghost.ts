import { DURATION, EASE_IN } from "@/src/components/design/motion";

export type Leaving = "delete" | "merge";

const bezier = (e: readonly number[]) => `cubic-bezier(${e.join(", ")})`;

/**
 * The removed divider's exit (brief §4.4): a copy of it, laid over its old
 * place in `layer`, leaves while the real row is already gone from the list
 * and the accessibility tree. Delete slides out right; a merge shrinks into
 * the drop. Reduced motion: a fade. No Web Animations (jsdom): nothing.
 */
export function flyOut(
  card: HTMLElement | null,
  layer: HTMLElement | null,
  kind: Leaving,
  reduced: boolean,
): void {
  if (!card || !layer || typeof card.animate !== "function") return;
  const from = card.getBoundingClientRect();
  const origin = layer.getBoundingClientRect();
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  ghost.removeAttribute("id");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  // The rect already holds a drag's offset; the copy mustn't add it twice.
  Object.assign(ghost.style, {
    position: "absolute",
    left: `${from.left - origin.left}px`,
    top: `${from.top - origin.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    translate: "none",
    rotate: "none",
    scale: "none",
  });
  layer.append(ghost);
  const frames: Keyframe[] = reduced
    ? [{ opacity: 1 }, { opacity: 0 }]
    : kind === "delete"
      ? [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateX(24px)" },
        ]
      : [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "scale(0.96)" },
        ];
  const run = ghost.animate(frames, {
    duration: (reduced ? DURATION.reduced : 0.18) * 1000,
    easing: bezier(EASE_IN),
    fill: "forwards",
  });
  const done = () => ghost.remove();
  run.addEventListener("finish", done);
  run.addEventListener("cancel", done);
}
