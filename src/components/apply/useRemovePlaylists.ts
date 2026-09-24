"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavLock } from "@/src/components/design/NavLock";
import { readManaged, readRemoval, type RemoveState } from "./remove";

export interface RemovePlaylists {
  state: RemoveState;
  /** Opens the tag and reads the candidates: the first Spotify call. */
  open: () => void;
  /** Ignored while removing: that request can't be taken back. */
  close: () => void;
  /** Removes every playlist the tag lists. */
  confirm: () => void;
  /** Reads the list again. After a failure some may already be gone, so
   *  nothing is removed until the owner confirms the fresh list. */
  retry: () => void;
}

const bodyOf = (res: Response): Promise<unknown> =>
  res.json().catch(() => null);

/**
 * Spec §8.2. `onRemoved` runs once any playlist went, so the page can read the
 * library again. Only ever started from a click.
 */
export function useRemovePlaylists(onRemoved: () => void): RemovePlaylists {
  const [state, setState] = useState<RemoveState>({ kind: "closed" });
  // Every read, close and removal takes a turn; an answer for an older turn is
  // dropped, so a list that lands after Not yet can't reopen the tag.
  const turn = useRef(0);
  const removing = useRef(false);
  const alive = useRef(false);
  const removed = useRef(onRemoved);

  useEffect(() => {
    removed.current = onRemoved;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Removing writes the cache after Spotify answers; the read may refresh the
  // token and re-save it. Either way the page must stay put.
  useNavLock(state.kind === "loading" || state.kind === "removing");

  const read = useCallback(async () => {
    const mine = ++turn.current;
    setState({ kind: "loading" });
    let next: RemoveState;
    try {
      const res = await fetch("/api/spotify/managed-playlists");
      next = readManaged(res.status, await bodyOf(res));
    } catch {
      next = { kind: "failed", step: "read" };
    }
    if (alive.current && turn.current === mine) setState(next);
  }, []);

  const open = useCallback(() => void read(), [read]);

  const close = useCallback(() => {
    if (removing.current) return;
    turn.current++;
    setState({ kind: "closed" });
  }, []);

  const remove = useCallback(async () => {
    if (state.kind !== "list" || removing.current) return;
    const { playlists } = state;
    removing.current = true;
    const mine = ++turn.current;
    setState({ kind: "removing", playlists });
    let next: RemoveState;
    try {
      const res = await fetch("/api/spotify/remove-playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: playlists.map((p) => p.id) }),
      });
      next = readRemoval(res.status, await bodyOf(res), playlists);
    } catch {
      next = { kind: "failed", step: "remove" };
    } finally {
      removing.current = false;
    }
    if (!alive.current) return;
    if (turn.current === mine) setState(next);
    if (next.kind === "removed" && next.count > 0) removed.current();
  }, [state]);

  const confirm = useCallback(() => void remove(), [remove]);

  return { state, open, close, confirm, retry: open };
}
