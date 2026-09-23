import type { ReactNode } from "react";

// Cream, not brass: the step's primary button is the one accent in view.
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[var(--color-text-primary)] underline decoration-[var(--color-border-strong)] underline-offset-4 transition-colors duration-200 hover:decoration-[var(--color-text-primary)]"
    >
      {children}
      <span aria-hidden> ↗</span>
    </a>
  );
}
