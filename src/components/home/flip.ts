import { rovingTarget } from "@/src/components/classify/roving";

// Flipping the home crate (brief §3 Home, §4.4). Dividers run front (0,
// largest) to back (n - 1, smallest), so "back" is the next index.

// rovingTarget's Down is +1: here Up and Right go back, Down and Left forward.
const AS_ROVING: Readonly<Record<string, string>> = {
  ArrowUp: "ArrowDown",
  ArrowRight: "ArrowDown",
  ArrowDown: "ArrowUp",
  ArrowLeft: "ArrowUp",
  Home: "Home",
  End: "End",
};

/** The divider a key pulls from divider `at`, or null for other keys. Stops at the ends. */
export function crateKeyTarget(
  key: string,
  at: number,
  count: number,
): number | null {
  const mapped = AS_ROVING[key];
  return mapped === undefined ? null : rovingTarget(mapped, at, count);
}

const SWIPE_PX = 60;
const SWIPE_PX_PER_S = 400;

/** A sideways drag on the sleeve: +1 = one back (a swipe left), -1 = one forward, 0 = stay. */
export function swipeStep(offsetX: number, velocityX: number): -1 | 0 | 1 {
  if (offsetX < -SWIPE_PX || velocityX < -SWIPE_PX_PER_S) return 1;
  if (offsetX > SWIPE_PX || velocityX > SWIPE_PX_PER_S) return -1;
  return 0;
}

const ENTRANCE_KEY = "sorter:home-crate-entrance";

// Spec §4.1: the settle and the pull play once per browser session. Storage
// can throw (private mode, blocked site data); then it plays once per mount.
export function entranceSeen(): boolean {
  try {
    return window.sessionStorage.getItem(ENTRANCE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markEntranceSeen(): void {
  try {
    window.sessionStorage.setItem(ENTRANCE_KEY, "1");
  } catch {
    // No storage: nothing to remember, so the next mount plays it again.
  }
}
