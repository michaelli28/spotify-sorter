"use client";
import { useId, type CSSProperties } from "react";
import clsx from "clsx";
import { tabTint } from "@/src/lib/sleeves/inks";
import {
  TEMPERATURES,
  TEMPERATURE_MEANINGS,
  type Temperature,
} from "@/src/lib/sleeves/temperature";

export interface ColourPickerProps {
  /** The owner's override; undefined = Auto. */
  value: Temperature | undefined;
  /** What Auto prints right now, so its swatch shows the guess. */
  guess: Temperature;
  onChange: (next: Temperature | undefined) => void;
}

const AUTO = "auto";

/**
 * A category's colour (spec §3.3): tabs printed like the bin's, each with its
 * name, standing on a rule; the chosen one lifts. Auto goes back to the guess
 * from the name, which is also named in words (not by tint alone). Native
 * radios, so the arrow keys move between them.
 */
export function ColourPicker({ value, guess, onChange }: ColourPickerProps) {
  const labelId = useId();
  const guessId = useId();
  const name = useId();
  const meaningId = useId();
  // Auto means whatever it guesses.
  const shown = value ?? guess;
  const options = [AUTO, ...TEMPERATURES] as const;
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <p id={labelId} className="font-semibold">
          Colour
        </p>
        <p id={guessId} className="mono text-ink-3">
          auto guesses {guess}
        </p>
      </div>
      <div className="flex gap-2 border-b border-rule-strong pt-[3px]">
        {options.map((option) => {
          const auto = option === AUTO;
          const checked = auto ? !value : value === option;
          return (
            <label
              key={option}
              // relative: the sr-only radio moves with its tab when the sheet
              // scrolls, so focusing it scrolls the tab into view. The ::before
              // grows the 16px tab to a 44px target without taking room.
              className="group/swatch relative cursor-pointer before:absolute before:-inset-x-1 before:-inset-y-3.5 before:content-['']"
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={checked}
                aria-label={auto ? "Auto (guess)" : undefined}
                aria-describedby={auto ? guessId : undefined}
                onChange={() => onChange(auto ? undefined : option)}
                className="peer sr-only"
              />
              <span
                style={
                  {
                    "--tab-fill": tabTint(auto ? guess : option),
                  } as CSSProperties
                }
                className={clsx(
                  "grid h-4 min-w-10 place-items-center rounded-t-[3px] border-b-0 bg-[var(--tab-fill)] px-2 font-mono text-[0.8rem] leading-none text-tab-ink",
                  "transition-transform duration-180 ease-out motion-reduce:transition-none",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ink",
                  // Auto's gaps show the card, so its dashes read at night too.
                  auto && "border-[1.5px] border-dashed bg-clip-padding",
                  !auto && (checked ? "border-[1.5px]" : "border"),
                  checked
                    ? "-translate-y-[3px] border-ink"
                    : // Hover only nudges: the full lift means chosen.
                      "border-rule-strong group-hover/swatch:-translate-y-px",
                )}
              >
                {option}
              </span>
            </label>
          );
        })}
      </div>
      {/* What the chosen colour means, in words: the tint alone says nothing. */}
      <p id={meaningId} aria-live="polite" className="mt-3 text-ink-2">
        <span className="mono text-ink">{shown}</span>{" "}
        {TEMPERATURE_MEANINGS[shown]}
      </p>
    </div>
  );
}
