// Spec §8.2, "Remove SpotifySorter playlists": what the price tag shows at each
// step, read from GET /api/spotify/managed-playlists and POST
// /api/spotify/remove-playlists. Never run against real Spotify.
import { z } from "zod";
import type { ManagedPlaylist as ServerPlaylist } from "@/src/lib/spotify/library";
import { errorCode, needsReconnect } from "./refusal";

const SOURCES = [
  "recorded",
  "prefix",
] as const satisfies readonly ServerPlaylist["source"][];

const ManagedSchema = z.object({
  playlists: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      source: z.enum(SOURCES),
    }),
  ),
});

const RemovalSchema = z.object({
  removed: z.array(z.string()),
  failed: z.array(z.object({ id: z.string() })),
});

/** A candidate as the tag lists it: its track count isn't shown. */
export type ManagedPlaylist = Pick<ServerPlaylist, "id" | "name" | "source">;
export type Named = Pick<ManagedPlaylist, "id" | "name">;

export type RemoveState =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "list"; playlists: readonly ManagedPlaylist[] }
  | { kind: "removing"; playlists: readonly ManagedPlaylist[] }
  | { kind: "empty" }
  /** The answer: how many went, and which didn't. */
  | { kind: "removed"; count: number; failed: readonly Named[] }
  | { kind: "reconnect" }
  /** The server refused: an Apply is writing (another tab, or a reload). */
  | { kind: "applying" }
  | { kind: "failed"; step: "read" | "remove" };

type ReadAnswer = Extract<
  RemoveState,
  { kind: "list" | "empty" | "reconnect" | "applying" | "failed" }
>;
type RemoveAnswer = Extract<
  RemoveState,
  { kind: "removed" | "reconnect" | "applying" | "failed" }
>;

const applyRunning = (status: number, body: unknown) =>
  status === 409 && errorCode(body) === "apply_running";

export function readManaged(status: number, body: unknown): ReadAnswer {
  if (needsReconnect(status, body)) return { kind: "reconnect" };
  if (applyRunning(status, body)) return { kind: "applying" };
  const parsed = status === 200 ? ManagedSchema.safeParse(body) : null;
  if (!parsed?.success) return { kind: "failed", step: "read" };
  const { playlists } = parsed.data;
  return playlists.length === 0
    ? { kind: "empty" }
    : { kind: "list", playlists };
}

/** `asked` names the failures: the answer carries only their ids. */
export function readRemoval(
  status: number,
  body: unknown,
  asked: readonly Named[],
): RemoveAnswer {
  if (needsReconnect(status, body)) return { kind: "reconnect" };
  if (applyRunning(status, body)) return { kind: "applying" };
  const parsed = status === 200 ? RemovalSchema.safeParse(body) : null;
  if (!parsed?.success) return { kind: "failed", step: "remove" };
  const byId = new Map(asked.map((p) => [p.id, p.name]));
  return {
    kind: "removed",
    count: parsed.data.removed.length,
    failed: parsed.data.failed.map(({ id }) => ({
      id,
      name: byId.get(id) ?? id,
    })),
  };
}

export function groupManaged<T extends Pick<ManagedPlaylist, "source">>(
  playlists: readonly T[],
): { recorded: T[]; prefix: T[] } {
  return {
    recorded: playlists.filter((p) => p.source === "recorded"),
    prefix: playlists.filter((p) => p.source === "prefix"),
  };
}

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
const list = new Intl.ListFormat("en-US", { type: "conjunction" });

export function removedLine(n: number): string {
  return `${count(n)} ${plural(n, "playlist")} removed.`;
}

// Past a few, names become a paragraph nobody reads (or hears) to the end.
const MAX_NAMED = 3;

export function failedLine(names: readonly string[]): string {
  return names.length > MAX_NAMED
    ? `Couldn't remove ${count(names.length)} playlists.`
    : `Couldn't remove ${list.format(names)}.`;
}

export function removeLabel(n: number): string {
  return `Remove ${count(n)} ${plural(n, "playlist")}`;
}
