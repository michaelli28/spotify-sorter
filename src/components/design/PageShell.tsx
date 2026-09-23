import type { ReactNode } from "react";
import { ButtonLink, type SafeHref } from "@/src/components/design/Button";

export interface PageShellProps {
  children: ReactNode;
  /** Only for information the title doesn't already carry. */
  eyebrow?: string;
  title?: ReactNode;
  /** A quiet way back, above the title. Label without an arrow. */
  back?: { href: SafeHref; label: string };
}

// The header doesn't animate: PageTransition's fade is the page's one entrance.
export function PageShell({ children, eyebrow, title, back }: PageShellProps) {
  return (
    <main className="mx-auto max-w-5xl px-gutter py-section">
      {back && (
        <ButtonLink
          href={back.href}
          variant="ghost"
          size="sm"
          className="-ml-1 mb-6"
        >
          <span aria-hidden>←</span>
          {back.label}
        </ButtonLink>
      )}
      {(eyebrow || title) && (
        <header className="mb-section">
          {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
          {title && (
            <h1 className="font-[family-name:var(--font-display)] text-display-2 tracking-tight text-[var(--color-text-primary)]">
              {title}
            </h1>
          )}
        </header>
      )}
      {children}
    </main>
  );
}
