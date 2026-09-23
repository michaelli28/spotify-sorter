// Spec §3.4 and §7.1-7.2: after Apply's `done`, each written playlist gets its
// sleeve as a real Spotify cover, one upload at a time. A cover failure never
// fails the Apply.
import { sleeveToJpeg } from "@/src/components/graphics/sleeve-to-jpeg";
import type { SleeveSpec } from "@/src/lib/sleeves/spec";

export type CoverOutcome = "ok" | "reconnect" | "failed";
/** skipped: never tried, because an earlier upload needed a reconnect. */
export type CoverState = "waiting" | "uploading" | "skipped" | CoverOutcome;

const errorOf = (body: unknown): unknown =>
  typeof body === "object" && body !== null && "error" in body
    ? body.error
    : undefined;

/** Reads POST /api/spotify/cover's answer (foundation-data.md). */
export function coverOutcome(status: number, body: unknown): CoverOutcome {
  if (status >= 200 && status < 300) return "ok";
  const error = errorOf(body);
  // Only a reconnect can help these; the page must not offer Retry.
  if (status === 403 && error === "missing_scope") return "reconnect";
  if (status === 401 && error === "reconnect") return "reconnect";
  return "failed";
}

export interface UploadInTurn<T> {
  items: readonly T[];
  upload: (item: T) => Promise<CoverOutcome>;
  onState: (index: number, state: CoverState) => void;
  /** False once the page is gone: stop before the next upload. */
  alive: () => boolean;
}

// One at a time: the cover route may refresh the token and re-save the cache,
// so no two uploads (and no Apply write) may overlap (foundation-data.md).
export async function uploadInTurn<T>({
  items,
  upload,
  onState,
  alive,
}: UploadInTurn<T>): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    if (!alive()) return;
    onState(i, "uploading");
    let outcome: CoverOutcome;
    try {
      outcome = await upload(items[i]!);
    } catch {
      outcome = "failed";
    }
    if (!alive()) return;
    onState(i, outcome);
    if (outcome === "reconnect") {
      for (let j = i + 1; j < items.length; j++) onState(j, "skipped");
      return;
    }
  }
}

export interface CoverTarget {
  /** The category id: the route resolves its playlist from the cache. */
  id: string;
  spec: SleeveSpec;
}

export interface PostCoverDeps {
  fetchImpl?: typeof fetch;
  toJpeg?: (spec: SleeveSpec) => Promise<string>;
}

/** Renders one sleeve to JPEG and posts it. Never throws. */
export async function postCover(
  { id, spec }: CoverTarget,
  { fetchImpl = fetch, toJpeg = sleeveToJpeg }: PostCoverDeps = {},
): Promise<CoverOutcome> {
  let jpegBase64: string;
  try {
    jpegBase64 = await toJpeg(spec);
  } catch {
    return "failed";
  }
  try {
    const res = await fetchImpl("/api/spotify/cover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categoryId: id, jpegBase64 }),
    });
    const body: unknown = res.ok ? null : await res.json().catch(() => null);
    return coverOutcome(res.status, body);
  } catch {
    return "failed";
  }
}

export interface CoverTally {
  total: number;
  ok: number;
  failed: number;
  reconnect: boolean;
  running: boolean;
}

export function tallyCovers(states: readonly CoverState[]): CoverTally {
  const n = (s: CoverState) => states.filter((x) => x === s).length;
  return {
    total: states.length,
    ok: n("ok"),
    failed: n("failed"),
    reconnect: states.includes("reconnect"),
    running: states.some((s) => s === "waiting" || s === "uploading"),
  };
}

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/**
 * The strip's tally: short, announced, never the whole sentence. The close
 * already counts the playlists, and the notice under it says what went wrong,
 * so the strip adds only a tally neither of them gives.
 */
export function coverStatus(t: CoverTally): string {
  if (t.total === 0) return "";
  if (t.running) return `Adding covers: ${t.ok + t.failed} of ${t.total}`;
  if (t.ok === t.total) return t.total === 1 ? "Cover added." : "Every cover added.";
  if (t.ok === 0) return "";
  return `${t.ok} of ${t.total} covers added.`;
}

export type CoverNotice = {
  /** retrying: Retry covers was pressed and is still working. */
  kind: "reconnect" | "retry" | "retrying";
  text: string;
};

/** The one line under the close when covers need the owner. */
export function coverNotice(
  t: CoverTally,
  { retrying = false }: { retrying?: boolean } = {},
): CoverNotice | null {
  if (t.running) {
    // Kept while the retry works, so the pressed button (and focus) stay put.
    return retrying ? { kind: "retrying", text: "Retrying covers…" } : null;
  }
  if (t.reconnect) {
    // The callback lands on /scope, so say how the covers get there after.
    return {
      kind: "reconnect",
      text: "Reconnect Spotify to add covers, then apply again.",
    };
  }
  if (t.failed > 0) {
    return {
      kind: "retry",
      text: `${t.failed} ${plural(t.failed, "cover")} didn't upload.`,
    };
  }
  return null;
}
