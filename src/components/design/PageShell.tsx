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
    <main className="page-frame pt-8 pb-section">
      {back && (
        <ButtonLink href={back.href} variant="ghost" size="sm" className="mb-4">
          {/* One child: the recipe's flex gap would split the underline in
              two. An underline doesn't reach into the inline-block arrow. */}
          <span>
            <span aria-hidden className="mr-1.5 inline-block">
              ←
            </span>
            {back.label}
          </span>
        </ButtonLink>
      )}
      {(eyebrow || title) && (
        <header className="mb-6">
          {eyebrow && <p className="mb-2 text-ink-2">{eyebrow}</p>}
          {title && (
            <h1 className="font-display text-display-2 text-ink">{title}</h1>
          )}
        </header>
      )}
      {children}
    </main>
  );
}
