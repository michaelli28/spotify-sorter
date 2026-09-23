import { join } from "node:path";
import { CacheVersionMismatch, readCache } from "@/src/lib/cache";
import { dataDir } from "@/src/lib/config/paths";
import { blindTrackIds } from "@/src/lib/labeling/blind";
import { readAppStatus, type AppStatus } from "@/src/lib/status";
import { buildShelf, type Shelf } from "@/src/components/home/shelf";
import { HomeView } from "@/src/components/home/HomeView";

type SearchParams = Record<string, string | string[] | undefined>;

// readCache only, like readAppStatus: withSpotify and ensureFreshToken
// re-save the cache and strip fields they don't know.
async function readShelf(status: AppStatus): Promise<Shelf | null> {
  if (status.version_mismatch || status.categories === 0) return null;
  let cache;
  try {
    cache = await readCache(join(dataDir(), "cache.json"));
  } catch (err) {
    if (err instanceof CacheVersionMismatch) return null;
    throw err;
  }
  // A sample that can't be read hides every record (null) rather than risk
  // showing a sampled song beside its category (spec §3.8).
  const blind = await blindTrackIds().then(
    (b) => b.ids,
    () => null,
  );
  return buildShelf(cache, status.category_counts, blind);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Awaited before the cache read: it makes the page request-time, so the
  // library is never read (and frozen) at build.
  const { error, detail } = await searchParams;
  // The nav's own answer, so home never offers a door the nav keeps locked.
  const status = await readAppStatus();
  const shelf = await readShelf(status);
  return (
    <HomeView
      status={status}
      shelf={shelf}
      denied={
        error === "denied"
          ? { detail: typeof detail === "string" ? detail : null }
          : undefined
      }
    />
  );
}
