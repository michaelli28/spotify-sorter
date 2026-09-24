"use client";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { DURATION, EASE_OUT } from "@/src/components/design/motion";
import { Button } from "@/src/components/design/Button";
import { TrackRow } from "@/src/components/design/TrackRow";
import { AlbumArt } from "@/src/components/graphics/AlbumArt";
import type { DraftCategory } from "@/src/lib/categories/merge";
import { effectiveTemperature } from "@/src/lib/sleeves/lexicon";
import { ColourPicker } from "./ColourPicker";
import { FieldTextarea } from "./FieldTextarea";
import { FitChart } from "./FitChart";
import { MergePicker } from "./MergePicker";
import { PrintedSleeve } from "./PrintedSleeve";
import type { CategoryStats } from "./stats";
import type { TrackLookupEntry } from "./TrackSearchModal";
import { useFocusAfterRender } from "./useFocusAfterRender";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

export interface CategorySheetProps {
  category: DraftCategory;
  /** The saved list, in catalogue order: the sleeves print against it. */
  catalogue: readonly DraftCategory[];
  /** Everything in the draft, for Merge into…'s list. */
  categories: readonly DraftCategory[];
  tracks: Record<string, TrackLookupEntry>;
  /** Saved numbers; absent for a category Classify hasn't sorted into. */
  stats: CategoryStats | undefined;
  fit: number;
  /** False while nothing is placed: no chart of zeros. */
  placed: boolean;
  /** A merge target before Classify: its saved numbers no longer hold. */
  stale: boolean;
  /** "Mostly" only once the labelling study is over. */
  showMostly: boolean;
  duplicate: boolean;
  /** "side": the pulled sheet (desktop). "inline": inside the divider. */
  variant: "side" | "inline";
  onChange: (next: DraftCategory) => void;
  onClose: () => void;
  onDelete: () => void;
  onMerge: (targetId: string) => void;
  onAddTrack: () => void;
}

/** The open category: its sleeve and name, its actions, then what it holds. */
export function CategorySheet({
  category,
  catalogue,
  categories,
  tracks,
  stats,
  fit,
  placed,
  stale,
  showMostly,
  duplicate,
  variant,
  onChange,
  onClose,
  onDelete,
  onMerge,
  onAddTrack,
}: CategorySheetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const focusAfter = useFocusAfterRender(rootRef);
  const [picking, setPicking] = useState(false);
  const [nameAtFocus, setNameAtFocus] = useState(category.name);
  const errorId = useId();
  const id = category.id;
  const side = variant === "side";
  const { reduced } = useMotionConfig();
  // Everything but the sleeve crossfades in; the sleeve arrives by its morph.
  const enter = side
    ? {
        initial: reduced ? { opacity: 0 } : { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: reduced ? DURATION.reduced : DURATION.state,
          ease: EASE_OUT,
        },
      }
    : {};

  // An emptied name goes back to what it was when the field took focus.
  function commitName() {
    const trimmed = category.name.trim();
    if (!trimmed) onChange({ ...category, name: nameAtFocus });
    else if (trimmed !== category.name)
      onChange({ ...category, name: trimmed });
  }

  function close() {
    commitName();
    setPicking(false);
    onClose();
  }

  // Escape from anywhere in the sheet; fields and the picker handle their own.
  // An Escape that cancels an IME composition (古风, うっせぇわ) isn't a close.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || e.defaultPrevented || e.nativeEvent.isComposing)
      return;
    e.preventDefault();
    close();
  }

  // Numbered as the index numbers its rows: by place in the draft.
  const others = categories.flatMap((c, i) =>
    c.id === id
      ? []
      : [
          {
            id: c.id,
            name: c.name,
            catalogueNo: i + 1,
            temperature: effectiveTemperature(c),
          },
        ],
  );
  const samples = category.example_track_ids.flatMap((t) => tracks[t] ?? []);
  const artists = showMostly ? (stats?.artists ?? []) : [];

  return (
    <div ref={rootRef} onKeyDown={onKeyDown}>
      <div
        className={clsx(
          "grid items-start",
          side
            ? "grid-cols-[120px_minmax(0,1fr)] gap-6 pt-6 min-[1101px]:grid-cols-[160px_minmax(0,1fr)]"
            : "grid-cols-[96px_minmax(0,1fr)] gap-4",
        )}
      >
        <PrintedSleeve
          category={category}
          catalogue={catalogue}
          size={side ? 160 : 96}
          className={side ? "size-[120px] min-[1101px]:size-40" : undefined}
        />
        <motion.div {...enter} className="min-w-0">
          <FieldTextarea
            face="display"
            data-focus={`name:${id}`}
            aria-label="Category name"
            value={category.name}
            invalid={duplicate}
            aria-describedby={duplicate ? errorId : undefined}
            onFocus={() => setNameAtFocus(category.name)}
            onBlur={commitName}
            onValueChange={(name) => onChange({ ...category, name })}
            onEnter={() =>
              rootRef.current
                ?.querySelector<HTMLElement>(`[data-focus="description:${id}"]`)
                ?.focus()
            }
            onEscape={close}
          />
          {duplicate && (
            <p id={errorId} role="alert" className="mt-1.5 text-danger">
              Another category is called this.
            </p>
          )}
          {artists.length > 0 && (
            <>
              <p className="mt-4 font-semibold">Mostly</p>
              <p className="text-ink-2">{artists.join(" · ")}</p>
            </>
          )}
        </motion.div>
      </div>

      <motion.div {...enter}>
        {/* The actions sit under the head and stay pinned while the sheet
            scrolls; the taller Merge picker scrolls away instead of covering it. */}
        <div
          className={clsx(
            "z-[1] mt-4 border-b border-rule bg-card",
            side
              ? clsx("-mx-6 px-6", !picking && "sticky top-0")
              : "-mx-4 px-4 max-tab:-mx-2.5 max-tab:px-2.5",
          )}
        >
          {picking ? (
            <div className="py-3">
              <MergePicker
                sourceName={category.name}
                targets={others}
                onMerge={onMerge}
                onCancel={() => {
                  setPicking(false);
                  focusAfter(`merge:${id}`);
                }}
              />
            </div>
          ) : (
            // One row down to the 380px sheet; wraps only on the narrowest phones.
            <div className="flex flex-wrap items-center gap-x-4 max-tab:justify-between min-[1101px]:gap-x-6">
              <Button variant="quiet" onClick={onAddTrack}>
                Add example
              </Button>
              <Button
                variant="quiet"
                data-focus={`merge:${id}`}
                disabled={others.length === 0}
                onClick={() => setPicking(true)}
              >
                Merge into…
              </Button>
              <Button variant="danger" onClick={onDelete}>
                Delete
              </Button>
              <Button variant="ghost" className="tab:ml-auto" onClick={close}>
                Close
              </Button>
            </div>
          )}
        </div>

        <FieldTextarea
          face="body"
          data-focus={`description:${id}`}
          aria-label="Description"
          placeholder="how it feels"
          className="mt-6 w-full"
          value={category.description}
          onValueChange={(description) =>
            onChange({ ...category, description })
          }
          onEscape={close}
        />

        <ColourPicker
          value={category.temperature}
          guess={effectiveTemperature({ ...category, temperature: undefined })}
          // undefined is Auto: the save leaves the key out (buildCategoriesPatch).
          onChange={(temperature) => onChange({ ...category, temperature })}
        />

        {placed && stats && (
          <FitChart byFit={stats.byFit} fit={fit} stale={stale} />
        )}

        {samples.length > 0 && (
          <>
            <h2 className="mt-8 mb-2 font-semibold">Examples</h2>
            <ol className="grid grid-cols-1 gap-1">
              {samples.map((t) => (
                <TrackRow
                  key={t.id}
                  title={t.title}
                  artist={t.artist_name}
                  href={`spotify:track:${t.id}`}
                  media={<AlbumArt trackId={t.id} size={44} link={false} />}
                />
              ))}
            </ol>
          </>
        )}
      </motion.div>
    </div>
  );
}
