import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests must never touch the real ./data or ./.env.local. Files that manage their
// own temp dir override these in their beforeEach (which runs after this one).
const scratch = mkdtempSync(join(tmpdir(), "sorter-test-"));
beforeEach(() => {
  process.env.SORTER_DATA_DIR ??= join(scratch, "data");
  process.env.SORTER_ENV_FILE ??= join(scratch, ".env.local");
});
afterEach(() => cleanup());
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// Tests must never reach real Spotify or Anthropic. msw captures this fetch as its
// passthrough, so requests a test forgot to mock land here and fail loudly.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return realFetch(input, init);
  }
  return Promise.reject(
    new Error(`Network blocked in tests: ${url.origin} (mock it with msw)`),
  );
};
