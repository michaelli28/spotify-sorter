import { join } from "node:path";

// Under vitest, never fall back to the real ./data (Spotify refresh token, spend
// logs) or ./.env.local (API keys); tests/setup.ts points these at a temp dir.
function repoPathOrRefuse(envVar: string, fallback: string): string {
  const override = process.env[envVar];
  if (override) return override;
  if (process.env.VITEST) {
    throw new Error(
      `${envVar} is unset under test; refusing to use ./${fallback}`,
    );
  }
  return join(process.cwd(), fallback);
}

export function dataDir(): string {
  return repoPathOrRefuse("SORTER_DATA_DIR", "data");
}

export function envFile(): string {
  return repoPathOrRefuse("SORTER_ENV_FILE", ".env.local");
}
