import type { Temperature } from "@/src/lib/sleeves/temperature";
import type { DraftCategory } from "./merge";

/**
 * The PATCH body that saves the edited category list.
 *
 * `_clear` is the load-bearing part. Without it the cache route merges the
 * posted map into the stored one (`patchCache`), so renames and additions land
 * but a DELETED category simply stays — it reappears on reload, and `/apply`
 * still creates a playlist for it. Clearing first makes the posted map the
 * whole truth, which is what the editor on screen already claims to be.
 */
export function buildCategoriesPatch(
  draft: readonly DraftCategory[],
  now: string,
): {
  _clear: ["categories"];
  categories: Record<
    string,
    {
      name: string;
      description: string;
      spotify_playlist_id: null;
      created_at: string;
      example_track_ids: string[];
      temperature?: Temperature;
    }
  >;
} {
  return {
    _clear: ["categories"],
    categories: Object.fromEntries(
      draft.map((c) => [
        c.id,
        {
          name: c.name,
          description: c.description,
          spotify_playlist_id: null,
          created_at: now,
          example_track_ids: c.example_track_ids,
          // Absent, never null: "Auto (guess)" clears by leaving it out.
          ...(c.temperature ? { temperature: c.temperature } : {}),
        },
      ]),
    ),
  };
}
