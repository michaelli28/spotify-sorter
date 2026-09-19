import { Fragment } from "react";
import clsx from "clsx";

// definitions.md is written for editing (**In:** / **Out:** lines): show each
// line as its own block, without the bold markers. The space between blocks
// keeps the lines apart when read as one accessible description.
export function Definition({
  text,
  id,
  className,
}: {
  text: string;
  id?: string;
  className?: string;
}) {
  const lines = text
    .split("\n")
    .map((l) => l.replaceAll("**", "").trim())
    .filter(Boolean);
  return (
    <span
      id={id}
      className={clsx(
        "block text-sm leading-snug text-[var(--color-text-secondary)]",
        className,
      )}
    >
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className="block">{l}</span>
        </Fragment>
      ))}
    </span>
  );
}
