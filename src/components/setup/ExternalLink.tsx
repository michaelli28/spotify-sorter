import type { ReactNode } from "react";

// Ink, not orange: the card's primary is the one accent in view.
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
      className="font-medium text-ink underline decoration-rule-strong decoration-[1.5px] underline-offset-4 transition-[text-decoration-color] duration-180 ease-out hover:decoration-ink"
    >
      {children}
      <span aria-hidden> ↗</span>
    </a>
  );
}
