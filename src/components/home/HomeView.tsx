import type { ReactNode } from "react";
import type { AppStatus } from "@/src/lib/status";
import { ButtonLink, buttonClass } from "@/src/components/design/Button";
import { PageShell } from "@/src/components/design/PageShell";
import { ClassifyGate } from "@/src/components/shared/ClassifyGate";

export interface HomeViewProps {
  status: AppStatus;
  /** Spotify's consent screen sent the user back without a grant. */
  denied?: { detail: string | null };
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
        {count(s.tracks, "track")}, <em>no categories yet</em>.
      </>
    );
  if (s.unsorted > 0)
    return (
      <>
        <em>
          {num(s.tracks - s.unsorted)} of {num(s.tracks)}
        </em>{" "}
        tracks sorted.
      </>
    );
  if (s.applied < s.categories)
    return (
      <>
        {count(s.tracks, "track")}, sorted into{" "}
        <em>{count(s.categories, "category", "categories")}</em>.
      </>
    );
  return (
    <>
      <em>{count(s.categories, "playlist")}</em> on Spotify.
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

export function HomeView({ status, denied }: HomeViewProps) {
  // A cache from another version reads as empty, so nothing below can be offered.
  const step = status.version_mismatch ? null : nextStep(status);
  const text = lede(status);
  const pages = (
    [
      ["/review", "Categories", status.categories > 0],
      ["/label", "Labels", status.categories > 0],
      [
        "/scope",
        "Check for new tracks",
        status.connected && (step === "sort" || step === "apply"),
      ],
    ] as const
  ).filter(([, , show]) => show);
  // Only beside the page links: alone it's noise, and every primary that
  // reaches Spotify leads somewhere that offers Reconnect on a refusal.
  const reconnect = status.configured && status.connected && pages.length > 0;
  const code =
    denied?.detail && OAUTH_CODE.test(denied.detail) ? denied.detail : null;
  // A declined reconnect leaves the stored token working, so that line sits
  // by Reconnect when it can, not above an action it didn't stop.
  const deniedLine = denied && (
    <p className="text-sm text-[var(--color-danger)]">
      Spotify didn&apos;t {status.connected ? "reconnect" : "connect"}
      {code && ` (${code})`}.
    </p>
  );
  const lineAtPrimary = !reconnect && deniedLine;

  return (
    <PageShell>
      <div className="mt-16 grid gap-y-section md:mt-24 lg:mt-32 lg:grid-cols-12 lg:items-end lg:gap-x-12">
        <div className="lg:col-span-8">
          <h1 className="font-[family-name:var(--font-display)] text-display-1 tracking-tight text-balance text-[var(--color-text-primary)]">
            {headline(status)}
          </h1>
          {text && (
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-[var(--color-text-secondary)]">
              {text}
            </p>
          )}
          {status.version_mismatch && (
            <p className="mt-10 max-w-lg text-lg leading-relaxed text-[var(--color-danger)]">
              Your library file is from another version of SpotifySorter.
            </p>
          )}
          {lineAtPrimary && <div className="mt-10">{lineAtPrimary}</div>}
          {step && (
            <div className={lineAtPrimary ? "-ml-1 mt-3" : "-ml-1 mt-12"}>
              <Primary step={step} unsorted={status.unsorted} />
            </div>
          )}
        </div>
        {pages.length > 0 && (
          <nav aria-label="Pages" className="lg:col-span-4">
            <ul className="-ml-1 flex flex-col items-start gap-1">
              {pages.map(([href, label]) => (
                <li key={href}>
                  <ButtonLink href={href} variant="ghost">
                    {label}
                  </ButtonLink>
                </li>
              ))}
            </ul>
            {reconnect && (
              <div className="mt-5">
                {deniedLine}
                <a
                  href="/api/auth/login"
                  data-variant="ghost"
                  className={buttonClass({
                    variant: "ghost",
                    size: "sm",
                    className: "-ml-1",
                  })}
                >
                  Reconnect Spotify
                </a>
              </div>
            )}
          </nav>
        )}
      </div>
    </PageShell>
  );
}
