import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// e2e never touches the real ./data, the real .env.local keys, or live
// Spotify/Anthropic: its own server (port 3100, never reused) gets a
// fresh temp data dir, fake keys, and base URLs pointing at a local mock.
// Workers inherit the env, so this dir is created once per run.
process.env.SORTER_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), "sorter-e2e-"));
const DATA_DIR = process.env.SORTER_E2E_DATA_DIR;
const APP_PORT = 3100;
const MOCK_PORT = 3199;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm exec tsx tests/e2e/mock-server.ts",
      url: `${MOCK}/__health`,
      reuseExistingServer: false,
      env: { MOCK_PORT: String(MOCK_PORT) },
    },
    {
      // A production build: `next dev` full-reloads each page once on first
      // compile, which detaches whatever the test is clicking.
      command: `pnpm exec next build && pnpm exec next start -H 127.0.0.1 -p ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        SORTER_DATA_DIR: DATA_DIR,
        SORTER_ENV_FILE: join(DATA_DIR, ".env.local"),
        SPOTIFY_API_BASE: `${MOCK}/spotify/v1`,
        SPOTIFY_ACCOUNTS_BASE: `${MOCK}/accounts`,
        ANTHROPIC_BASE_URL: `${MOCK}/anthropic`,
        SPOTIFY_CLIENT_ID: "e2e-fake-client-id-00000000",
        ANTHROPIC_API_KEY: "sk-ant-e2e-fake",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
