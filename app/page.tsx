import { readAppStatus } from "@/src/lib/status";
import { HomeView } from "@/src/components/home/HomeView";

type SearchParams = Record<string, string | string[] | undefined>;

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
  return (
    <HomeView
      status={status}
      denied={
        error === "denied"
          ? { detail: typeof detail === "string" ? detail : null }
          : undefined
      }
    />
  );
}
