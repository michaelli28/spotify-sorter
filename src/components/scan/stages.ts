/** The scan's stages, in the order runScan reaches them. */
export const STAGES = ["playlists", "liked", "artists"] as const;
export type StageId = (typeof STAGES)[number];
export type StageState = "pending" | "active" | "done" | "skipped";

/** One `progress` event from /api/spotify/scan. */
export interface StageEvent {
  stage: StageId;
  current: number;
  total: number;
}

export interface StageRow {
  id: StageId;
  state: StageState;
  /** Only while the server is counting inside this stage. */
  count: { current: number; total: number } | null;
}

// runScan always reads its sources, but pulls artist genres only when it found
// tracks it had not seen, so that stage is never assumed to have started.
const ALWAYS_RUNS: ReadonlySet<StageId> = new Set(["playlists", "liked"]);

/**
 * Where the scan is, from the last progress event alone. Liked Songs reports
 * only when it is finished, so it counts as running once the playlists are in.
 */
export function stageRows({
  visible,
  last,
  finished,
}: {
  visible: readonly StageId[];
  last: StageEvent | null;
  finished: boolean;
}): StageRow[] {
  const lastIndex = last ? STAGES.indexOf(last.stage) : -1;
  const lastRunning =
    last !== null && last.current < last.total && visible.includes(last.stage);
  // Stages before this index are finished.
  const passed = last === null ? 0 : lastRunning ? lastIndex : lastIndex + 1;
  const next = visible.find((id) => STAGES.indexOf(id) >= passed);
  const active =
    !finished && next && (next === last?.stage || ALWAYS_RUNS.has(next))
      ? next
      : null;

  return visible.map((id) => {
    const index = STAGES.indexOf(id);
    const state: StageState = finished
      ? ALWAYS_RUNS.has(id) || index <= lastIndex
        ? "done"
        : "skipped"
      : id === active
        ? "active"
        : index < passed
          ? "done"
          : "pending";
    const counting =
      state === "active" && last?.stage === id && last.current > 0;
    return {
      id,
      state,
      count: counting ? { current: last.current, total: last.total } : null,
    };
  });
}
