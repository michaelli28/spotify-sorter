import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { AppStatus } from "@/src/lib/status";
import { ButtonLink, buttonClass } from "@/src/components/design/Button";
import { ClassifyGate } from "@/src/components/shared/ClassifyGate";
import { EmptyCrate } from "./EmptyCrate";
import { HomeCrate } from "./HomeCrate";
import { PressList } from "@/src/components/graphics/PressList";
import type { Shelf } from "./shelf";

export interface HomeViewProps {
  status: AppStatus;
  /** Spotify's consent screen sent the user back without a grant. */
  denied?: { detail: string | null };
  /** The crate and the press list. Absent before there are categories. */
  shelf?: Shelf | null;
}

type Step = "setup" | "connect" | "choose" | "sort" | "apply" | "check";

// /classify, and /review with no categories, spend on load: "sort" goes
// through ClassifyGate's price, and nothing here links /review without categories.
function nextStep(s: AppStatus): Step {
  if (!s.configured) return "setup";
  if (s.tracks === 0 || s.categories === 0)
    return s.connected ? "choose" : "connect";
  if (s.unsorted > 0) return "sort";
  if (!s.connected) return "connect";
  return s.applied < s.categories ? "apply" : "check";
}

const num = (n: number) => n.toLocaleString("en-US");
const count = (n: number, one: string, many = `${one}s`) =>
  `${num(n)} ${n === 1 ? one : many}`;
// At display size a number must never end a line without its noun.
const NOWRAP = "whitespace-nowrap";

function headline(s: AppStatus): ReactNode {
  if (s.tracks === 0 || s.version_mismatch)
    return (
      <>
        Sort your <em>library</em> into vibes that mean something.
      </>
    );
  if (s.categories === 0)
    return (
      <>
        <span className={NOWRAP}>{count(s.tracks, "track")},</span>{" "}
        <em>no categories yet</em>.
      </>
    );
  if (s.unsorted > 0)
    return (
      <>
        <em>{num(s.tracks - s.unsorted)} of</em>{" "}
        <span className={NOWRAP}>
          <em>{num(s.tracks)}</em> tracks
        </span>{" "}
        sorted.
      </>
    );
  if (s.applied < s.categories)
    return (
      <>
        <span className={NOWRAP}>{count(s.tracks, "track")},</span> sorted into{" "}
        <em className={NOWRAP}>
          {count(s.categories, "category", "categories")}
        </em>
        .
      </>
    );
  return (
    <>
      <em className={NOWRAP}>{count(s.categories, "playlist")}</em> on Spotify.
    </>
  );
}

function lede(s: AppStatus): string | null {
  if (s.version_mismatch) return null;
  if (s.tracks === 0)
    return "Claude names the sub-genres and moods in the playlists you pick, sorts every track into them, and writes each one back to your Spotify as a playlist.";
  if (s.categories === 0 || s.unsorted > 0 || s.applied >= s.categories)
    return null;
  return s.applied === 0
    ? "None on Spotify yet."
    : `${num(s.applied)} of ${num(s.categories)} on Spotify.`;
}

// Plain <a>s: /api/auth/login is a route handler that needs a full
// navigation, and /setup is outside SafeHref.
function Primary({ step, unsorted }: { step: Step; unsorted: number }) {
  switch (step) {
    case "setup":
      return (
        <a href="/setup" data-variant="primary" className={buttonClass()}>
          Set up
        </a>
      );
    case "connect":
      return (
        <a
          href="/api/auth/login"
          data-variant="primary"
          className={buttonClass()}
        >
          Connect Spotify
        </a>
      );
    case "choose":
      return <ButtonLink href="/scope">Choose playlists</ButtonLink>;
    case "sort":
      return <ClassifyGate unsorted={unsorted} />;
    case "apply":
      return <ButtonLink href="/apply">Apply to Spotify</ButtonLink>;
    case "check":
      return <ButtonLink href="/scope">Check for new tracks</ButtonLink>;
  }
}

// OAuth error codes are snake_case; anything else in the URL isn't Spotify's.
const OAUTH_CODE = /^[a-z_]{1,40}$/;

const ROUTE =
  "flex min-h-12 items-center no-underline decoration-[1.5px] underline-offset-[5px] hover:underline";

export function HomeView({ status, denied, shelf }: HomeViewProps) {
  // A cache from another version reads as empty, so nothing below can be offered.
  const step = status.version_mismatch ? null : nextStep(status);
  const text = lede(status);
  // Categories and Labels live in the site nav now (spec §3.1).
  const check = status.connected && (step === "sort" || step === "apply");
  // Only once there's a library to keep: before that, every primary that
  // reaches Spotify leads somewhere that offers Reconnect on a refusal.
  const reconnect =
    status.configured && status.connected && status.categories > 0;
  const code =
    denied?.detail && OAUTH_CODE.test(denied.detail) ? denied.detail : null;
  // A declined reconnect leaves the stored token working, so that line sits
  // by Reconnect when it can, not above an action it didn't stop.
  const deniedLine = denied && (
    <p className="pb-3 text-danger">
      Spotify didn&apos;t {status.connected ? "reconnect" : "connect"}
      {code && ` (${code})`}.
    </p>
  );
  const lineAtPrimary = !reconnect && deniedLine;

  const crate =
    shelf && shelf.entries.length > 0 && !status.version_mismatch
      ? shelf
      : null;
  // Nothing placed, or tracks still unsorted (Apply is locked): the list
  // would promise a write that can't happen (brief §3 States).
  const press = crate && crate.adds > 0 && status.unsorted === 0 ? crate : null;
  const allOn = status.applied >= status.categories;

  return (
    <main className="page-frame pb-section">
      <section className="grid gap-y-12 pt-8 pb-16 tab:pt-12 desk:max-[1100px]:grid-cols-[minmax(0,1fr)_380px] desk:max-[1100px]:gap-x-12 min-[1101px]:grid-cols-[minmax(0,1fr)_440px] min-[1101px]:gap-x-16">
        <div className="flex min-w-0 flex-col items-start desk:pt-12">
          <h1 className="font-display text-display-1 text-balance text-ink desk:max-w-[14ch]">
            {headline(status)}
          </h1>
          {text && (
            <p className="mt-4 max-w-lg text-lead text-ink-2 tab:mt-6">
              {text}
            </p>
          )}
          {status.version_mismatch && (
            <p className="mt-8 max-w-lg text-lead text-danger">
              Your library file is from another version of SpotifySorter.
            </p>
          )}
          {lineAtPrimary && (
            <div className="mt-8 tab:mt-12">{lineAtPrimary}</div>
          )}
          {step && (
            <div
              className={clsx(
                "flex w-full max-tab:[&>[data-variant=primary]]:flex-1",
                lineAtPrimary ? "mt-1" : "mt-8 tab:mt-12",
              )}
            >
              <Primary step={step} unsorted={status.unsorted} />
            </div>
          )}
          {(check || reconnect) && (
            <nav
              aria-label="Library"
              className="mt-12 w-full tab:mt-16 desk:max-w-[30rem]"
            >
              <ul className="border-t-[1.5px] border-ink">
                {check && (
                  <li className="border-b border-rule">
                    <Link href="/scope" className={clsx(ROUTE, "font-medium")}>
                      Check for new tracks
                    </Link>
                  </li>
                )}
                {reconnect && (
                  <li className="border-b border-rule">
                    <a
                      href="/api/auth/login"
                      className={clsx(ROUTE, "text-ink-2 hover:text-ink")}
                    >
                      Reconnect Spotify
                    </a>
                    {deniedLine}
                  </li>
                )}
              </ul>
            </nav>
          )}
        </div>
        {crate ? <HomeCrate entries={crate.entries} /> : <EmptyCrate />}
      </section>

      {press && (
        <section
          aria-labelledby="press-heading"
          className="border-t-[1.5px] border-ink pt-12 tab:pt-16"
        >
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-12 gap-y-2 tab:mb-12">
            <h2 id="press-heading" className="font-display text-display-2">
              {allOn ? "On Spotify" : "What Apply writes"}
            </h2>
            <p className="num text-ink-2">
              {/* Once all are on Spotify the h1 has already said how many. */}
              {!allOn && (
                <>
                  <b className="font-semibold text-ink">
                    {num(press.playlists)}
                  </b>{" "}
                  {press.playlists === 1 ? "playlist" : "playlists"} ·{" "}
                </>
              )}
              <b className="font-semibold text-ink">{num(press.adds)}</b>{" "}
              {press.adds === 1 ? "add" : "adds"} at fit {press.threshold}
              {press.fitNone > 0 && (
                <>
                  {" · "}
                  <b className="font-semibold text-ink">
                    {num(press.fitNone)}
                  </b>{" "}
                  {press.fitNone === 1 ? "track fits" : "tracks fit"} none
                </>
              )}
            </p>
          </div>
          <PressList
            rows={press.entries.map(
              ({ id, catalogueNo, name, count, spec }) => ({
                id,
                catalogueNo,
                name,
                count,
                spec,
              }),
            )}
            onSpotify={
              new Set(press.entries.filter((e) => e.onSpotify).map((e) => e.id))
            }
          />
        </section>
      )}
    </main>
  );
}
