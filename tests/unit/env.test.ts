import { describe, it, expect } from "vitest";
import { parseEnv } from "@/src/lib/config/env";

describe("parseEnv", () => {
  it("accepts valid env", () => {
    const env = parseEnv({
      SPOTIFY_CLIENT_ID: "a".repeat(32),
      ANTHROPIC_API_KEY: "sk-ant-XXXX",
    });
    expect(env.SPOTIFY_CLIENT_ID).toHaveLength(32);
    expect(env.ANTHROPIC_API_KEY).toMatch(/^sk-ant-/);
  });

  it("rejects missing client id", () => {
    expect(() => parseEnv({ ANTHROPIC_API_KEY: "sk-ant-x" })).toThrow(
      /SPOTIFY_CLIENT_ID/,
    );
  });

  it("rejects anthropic key not starting with sk-ant-", () => {
    expect(() =>
      parseEnv({
        SPOTIFY_CLIENT_ID: "a".repeat(32),
        ANTHROPIC_API_KEY: "sk-foo",
      }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });
});
