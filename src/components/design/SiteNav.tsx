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
// guesses" choice, which would un-blind a labeller.
const HIDDEN = new Set(["/", "/setup", "/label"]);

const sorted = (s: AppStatus) => s.categories > 0 && s.unsorted === 0;

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
  "inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-sm transition-colors duration-200";

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
  const { spring } = useMotionConfig();
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
    <nav aria-label="Site" className="mx-auto max-w-5xl px-gutter pt-3 md:pt-6">
      <div className="grid grid-cols-[1fr_auto] items-baseline md:flex">
        <Item
          href="/"
          live={!locked}
          className={clsx(
            "inline-flex min-h-11 items-center justify-self-start font-[family-name:var(--font-display)] text-xl tracking-tight transition-colors duration-200",
            locked
              ? "text-[var(--color-text-tertiary)]"
              : "text-[var(--color-text-primary)]",
          )}
        >
          SpotifySorter
        </Item>
        <ol className="col-span-2 row-start-2 -mx-2 flex justify-between md:mr-8 md:ml-auto md:gap-4">
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
                  className={clsx(
                    ITEM,
                    current
                      ? "text-[var(--color-text-primary)]"
                      : looksOpen
                        ? "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-tertiary)] opacity-60",
                  )}
                >
                  <span className="relative">
                    {step.label}
                    {current && (
                      <motion.span
                        layoutId="site-nav-current"
                        transition={spring}
                        className="absolute inset-x-0 -bottom-1 h-px bg-[var(--color-text-primary)]"
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
          live={!locked}
          className={clsx(
            ITEM,
            "col-start-2 row-start-1 -mr-2 text-[var(--color-text-tertiary)]",
            locked ? "opacity-60" : "hover:text-[var(--color-text-primary)]",
          )}
        >
          Labels
        </Item>
      </div>
    </nav>
  );
}
