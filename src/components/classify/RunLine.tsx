/**
 * The run's line in the top strip, beside the shared band in `end` (as on
 * /apply). The stream counts batches of tracks, so the line says batches.
 */
export function RunLine({
  progress,
}: {
  progress: { done: number; total: number } | null;
}) {
  if (!progress) return <>Waiting for the first batch</>;
  const total = Math.max(progress.total, 0);
  const done = Math.min(Math.max(progress.done, 0), total);
  return (
    <>
      <span className="num">
        {done} of {total}
      </span>{" "}
      batches
    </>
  );
}
