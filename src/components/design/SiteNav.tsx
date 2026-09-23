"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import type { AppStatus } from "@/src/lib/status";
import type { SafeHref } from "@/src/components/design/Button";
import { useNavLockState } from "@/src/components/design/NavLock";
import { useMotionConfig } from "@/src/hooks/useMotionConfig";

// /label: leaving and coming back resets its in-memory "hide the model's
// guesses" choice, which would un-blind a labeller. / shows it (spec §3.1).
const HIDDEN = new Set(["/setup", "/label"]);

const sorted = (s: AppStatus) => s.categories > 0 && s.unsorted === 0;
// /label needs categories to label against; a mismatch reports none.
const labelling = (s: AppStatus) => s.categories > 0;

// A step is a link only when loading its page spends nothing: /review with no
// categories proposes, /classify with unsorted tracks classifies, on load.
const STEPS: readonly {
  href: SafeHref;
  label: string;
  pages: readonly string[];
  open: (s: AppStatus) => boolean;
}[] = [
  {
    href: "/scope",
    label: "Sources",
    pages: ["/scope", "/scan", "/diff"],
    open: (s) => s.connected,
  },
  {
    href: "/review",
    label: "Categories",
    pages: ["/review"],
    open: (s) => s.categories > 0,
  },
  { href: "/classify", label: "Fit", pages: ["/classify"], open: sorted },
  { href: "/apply", label: "Apply", pages: ["/apply"], open: sorted },
];

const ITEM =
  "inline-flex min-h-11 min-w-11 items-center justify-center px-2.5 font-medium transition-colors duration-180 ease-out";

// Available steps in ink-2, the current one in ink, locked ones in ink-3.
const tone = (current: boolean, open: boolean) =>
  current
    ? "text-ink"
    : open
      ? "text-ink-2 hover:text-ink"
      : "cursor-default text-ink-3";

/** The shop's record: a navy disc, two grooves, a paper label. */
function RecordMark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      aria-hidden="true"
      className="flex-none"
    >
      <circle cx="13" cy="13" r="12" className="fill-current" />
      <g className="fill-none stroke-paper" strokeWidth=".7" opacity=".55">
        <circle cx="13" cy="13" r="9" />
        <circle cx="13" cy="13" r="6.5" />
      </g>
      <circle cx="13" cy="13" r="3.4" className="fill-paper" />
      <circle cx="13" cy="13" r="1" className="fill-current" />
    </svg>
  );
}

function Item({
  href,
  live,
  current,
  className,
  children,
}: {
  href: SafeHref;
  live: boolean;
  current?: boolean;
  className: string;
  children: ReactNode;
}) {
  const shared = {
    "aria-current": current ? ("page" as const) : undefined,
    className,
  };
  if (live)
    return (
      <Link href={href} {...shared}>
        {children}
      </Link>
    );
  // Never a <button>: e2e finds the confirm on /apply by button name "Apply".
  return (
    <span role="link" aria-disabled="true" {...shared}>
      {children}
    </span>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const { locked, releases } = useNavLockState();
  const { snap } = useMotionConfig();
  const hidden = HIDDEN.has(pathname);
  // A finished job may have changed the library, so a release asks again too.
  const key = `${pathname}#${releases}`;
  const [fetched, setFetched] = useState<{
    key: string;
    status: AppStatus | null;
  } | null>(null);

  useEffect(() => {
    if (hidden || locked) return;
    let wanted = true;
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AppStatus>) : null))
      .catch(() => null)
      .then((status) => {
        if (wanted) setFetched({ key, status });
      });
    return () => {
      wanted = false;
    };
  }, [key, hidden, locked]);

  if (hidden) return null;

  // Links need this page's answer; colours keep the last one meanwhile, so a
  // route change doesn't flash every step dim for the length of a fetch.
  const fresh = !locked && fetched?.key === key ? fetched.status : null;
  const last = locked ? null : (fetched?.status ?? null);

  return (
    <nav aria-label="Site" className="page-frame pt-4">
      {/* Phones: wordmark and Labels on row 1, the four steps across row 2. */}
      <div className="flex flex-wrap items-center border-b-[1.5px] border-ink pb-3 tab:flex-nowrap tab:gap-6">
        <Item
          href="/"
          live={!locked}
          current={pathname === "/"}
          className={clsx(
            "mr-auto inline-flex min-h-11 items-center gap-2.5 font-display text-lead tracking-[-0.005em] transition-colors duration-180 ease-out tab:mr-0",
            locked ? "text-ink-3" : "text-ink",
          )}
        >
          <RecordMark />
          SpotifySorter
        </Item>
        <ol className="order-3 -mx-2.5 flex w-[calc(100%+20px)] justify-between tab:order-none tab:mx-0 tab:ml-auto tab:w-auto tab:justify-start tab:gap-2">
          {STEPS.map((step) => {
            const current = step.pages.includes(pathname);
            const live = fresh !== null && step.open(fresh);
            const looksOpen = last !== null && step.open(last);
            return (
              <li key={step.href}>
                <Item
                  href={step.href}
                  live={live}
                  current={current}
                  className={clsx(ITEM, tone(current, looksOpen))}
                >
                  <span className="relative">
                    {step.label}
                    {current && (
                      <motion.span
                        layoutId="site-nav-current"
                        transition={snap}
                        className="absolute inset-x-0 -bottom-[3px] h-0.5 bg-current"
                      />
                    )}
                  </span>
                </Item>
              </li>
            );
          })}
        </ol>
        <Item
          href="/label"
          live={fresh !== null && labelling(fresh)}
          className={clsx(
            ITEM,
            tone(false, last !== null && labelling(last)),
            "-mr-2.5 tab:mr-0 tab:ml-2 tab:border-l tab:border-rule-strong tab:pl-4",
          )}
        >
          Labels
        </Item>
      </div>
    </nav>
  );
}
