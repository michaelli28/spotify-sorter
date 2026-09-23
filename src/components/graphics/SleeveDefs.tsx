import { SLEEVE_DEFS_INNER } from "@/src/lib/sleeves/svg";

/**
 * The dot screen and ink speckle every <Sleeve> references by id. Mount exactly one
 * per document (the root layout). Server-safe: no client JS.
 */
export function SleeveDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
      focusable="false"
      // A constant built from a fixed seed (no user input): the same defs the export path inlines.
      dangerouslySetInnerHTML={{ __html: SLEEVE_DEFS_INNER }}
    />
  );
}
