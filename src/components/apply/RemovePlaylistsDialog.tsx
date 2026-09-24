"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, buttonClass } from "@/src/components/design/Button";
import { Dialog } from "@/src/components/design/Dialog";
import { parsePlaylistName } from "@/src/lib/categories/prefix";
import {
  failedLine,
  groupManaged,
  removeLabel,
  removedLine,
  type Named,
} from "./remove";
import type { RemovePlaylists } from "./useRemovePlaylists";

export const REMOVE_TITLE = "Remove SpotifySorter playlists";

// Plain text, not a link: the owner copies it into a browser signed in to
// Spotify. One click selects the whole address.
const RESTORE = (
  <>
    Spotify keeps removed playlists for 90 days: restore them at{" "}
    <span className="select-all text-ink">
      spotify.com/account/recover-playlists
    </span>
    .
  </>
);

// Locked like `disabled`, but still focusable: the pressed control keeps focus.
const HELD =
  "aria-disabled:cursor-not-allowed aria-disabled:text-ink-3 aria-disabled:decoration-rule";

interface GroupProps {
  /** Left out when it would only repeat the dialog's title. */
  title?: string;
  names: readonly Named[];
}

// Row-major, so a scrolled-off name is always at the end, never mid-column.
function Group({ title, names }: GroupProps) {
  const id = useId();
  return (
    <div>
      {title && (
        <h3 id={id} className="mb-2 font-medium text-ink">
          {title}
        </h3>
      )}
      <ul
        aria-labelledby={title ? id : undefined}
        className="grid gap-x-8 tab:grid-cols-2"
      >
        {names.map((p) => (
          <li key={p.id} className="py-0.5">
            {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Sticks to the scrolling body's bottom edge while names are hidden below it;
// at the end of the list it sits under the last row, over blank card.
const MORE_BELOW = (
  <div
    aria-hidden
    className="pointer-events-none sticky bottom-0 h-8 bg-linear-to-t from-card to-card/0"
  />
);

export interface RemovePlaylistsDialogProps {
  removal: RemovePlaylists;
  /** The playlist prefix: stripped from every name, printed in one heading. */
  prefix: string;
}

/** Spec §8.2: the price tag behind "Remove SpotifySorter playlists…". */
export function RemovePlaylistsDialog({
  removal,
  prefix,
}: RemovePlaylistsDialogProps) {
  const { state } = removal;
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = state.kind === "removing";
  const listed =
    state.kind === "list" || state.kind === "removing" ? state.playlists : null;
  const answered = state.kind !== "loading" && !listed;
  const shown = (p: Named): Named => ({
    id: p.id,
    name: parsePlaylistName(prefix, p.name).name,
  });

  // The pressed control can go with the step (Remove, Retry): keep focus in
  // the tag, on the way out.
  useEffect(() => {
    if (state.kind === "closed") return;
    const active = document.activeElement;
    if (!active || active === document.body) cancel.current?.focus();
  }, [state.kind]);

  let lines: ReactNode = null;
  switch (state.kind) {
    case "loading":
      lines = <p>Reading your Spotify playlists…</p>;
      break;
    case "empty":
      lines = (
        <p className="text-ink">No SpotifySorter playlists on Spotify.</p>
      );
      break;
    case "removed":
      lines = (
        <>
          {state.count > 0 && (
            <p className="text-ink">{removedLine(state.count)}</p>
          )}
          {state.failed.length > 0 && (
            <p className="text-danger">
              {failedLine(state.failed.map((p) => shown(p).name))}
            </p>
          )}
        </>
      );
      break;
    case "reconnect":
      lines = (
        <p className="text-danger">Spotify needs you to reconnect first.</p>
      );
      break;
    case "applying":
      lines = (
        <p className="text-ink">
          Apply is still writing to Spotify. Try again once it&apos;s done.
        </p>
      );
      break;
    case "failed":
      lines = (
        <p className="text-danger">
          {state.step === "read"
            ? "Couldn't read your Spotify playlists."
            : "Couldn't remove them."}
        </p>
      );
      break;
  }

  const groups =
    listed &&
    groupManaged(listed.map((p) => ({ ...shown(p), source: p.source })));

  let first: ReactNode = null;
  if (state.kind === "loading" || listed) {
    first = (
      <Button
        key="confirm"
        variant="danger-confirm"
        disabled={!listed}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        onClick={busy ? undefined : removal.confirm}
        className="aria-busy:cursor-progress"
      >
        {listed ? (
          // Sized by the count label, so "Removing…" doesn't pull Not yet
          // across (or up a row on a phone).
          <span className="grid text-center">
            <span aria-hidden className="invisible col-start-1 row-start-1">
              {removeLabel(listed.length)}
            </span>
            <span className="col-start-1 row-start-1">
              {busy ? "Removing…" : removeLabel(listed.length)}
            </span>
          </span>
        ) : (
          "Remove playlists"
        )}
      </Button>
    );
  } else if (state.kind === "reconnect") {
    first = (
      // A route handler: it needs a full navigation, not next/link.
      <a
        key="reconnect"
        href="/api/auth/login"
        data-variant="quiet"
        className={buttonClass({ variant: "quiet" })}
      >
        Reconnect Spotify
      </a>
    );
  } else if (
    state.kind === "failed" ||
    state.kind === "applying" ||
    (state.kind === "removed" && state.failed.length > 0)
  ) {
    first = (
      <Button key="retry" variant="quiet" onClick={removal.retry}>
        Retry
      </Button>
    );
  }

  return (
    <Dialog
      open={state.kind !== "closed"}
      onClose={removal.close}
      title={REMOVE_TITLE}
      description={RESTORE}
      width="lg"
      initialFocus={cancel}
      actions={
        <>
          {first}
          {/* One button throughout, so focus stays on it as the steps change. */}
          <Button
            key="cancel"
            ref={cancel}
            variant="quiet"
            aria-disabled={busy || undefined}
            onClick={busy ? undefined : removal.close}
            className={HELD}
          >
            {answered ? "Close" : "Not yet"}
          </Button>
        </>
      }
    >
      {/* Always mounted: a live region only announces what changes in it. */}
      <div role="status">{lines}</div>
      {groups && (
        // The few only named like SpotifySorter's first: they are the ones
        // the owner may not expect to lose, so they never scroll away.
        <>
          <div className="space-y-6">
            {groups.prefix.length > 0 && (
              <Group title={`Named ${prefix} …`} names={groups.prefix} />
            )}
            {groups.recorded.length > 0 && (
              <Group
                title={
                  groups.prefix.length > 0 ? "Made by SpotifySorter" : undefined
                }
                names={groups.recorded}
              />
            )}
          </div>
          {MORE_BELOW}
        </>
      )}
    </Dialog>
  );
}
