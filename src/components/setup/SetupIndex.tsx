import clsx from "clsx";

// The file's quarter-cut tabs. Only cards already passed are buttons: going
// back keeps every typed value, and a later card can't be skipped to.
export function SetupIndex({
  steps,
  current,
  locked,
  onBack,
}: {
  steps: readonly string[];
  current: number;
  /** Busy: the tabs hold still, like Back. */
  locked: boolean;
  onBack: (to: number) => void;
}) {
  return (
    <ol
      aria-label="Setup"
      // Phones: tabs the width of their number (the card's title names the step).
      className="flex gap-2 px-2 tab:grid tab:grid-cols-4 tab:px-3"
    >
      {steps.map((label, i) => {
        const isCurrent = i === current;
        const shape = clsx(
          "flex h-8 w-full min-w-11 items-center gap-2 rounded-t-[3px] border border-b-0 px-3 tab:h-9",
          "transition-[color,background-color,border-color,translate,box-shadow] duration-240 ease-out motion-reduce:transition-none",
          // Reversed and lifted 3px; the shadow is the tab's own fill, so it
          // still meets the card.
          isCurrent
            ? "-translate-y-[3px] border-tab-pressed-edge bg-tab-pressed text-tab-pressed-ink shadow-[0_3px_0_var(--tab-pressed)]"
            : "border-rule-strong bg-card",
        );
        const face = (
          <>
            <span className="num font-mono text-label">
              {String(i + 1).padStart(2, "0")}
            </span>{" "}
            <span className="truncate font-medium max-tab:sr-only">
              {label}
            </span>
          </>
        );
        return (
          <li
            key={label}
            aria-current={isCurrent ? "step" : undefined}
            className="min-w-0"
          >
            {i < current ? (
              <button
                type="button"
                disabled={locked}
                onClick={() => onBack(i)}
                className={clsx(
                  shape,
                  "relative text-ink-2 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-3",
                  // A 44px target: the tab reaches up into the counter.
                  "before:absolute before:inset-x-0 before:-top-3 before:bottom-0 before:content-['']",
                )}
              >
                {face}
              </button>
            ) : (
              <div className={clsx(shape, !isCurrent && "text-ink-3")}>
                {face}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
