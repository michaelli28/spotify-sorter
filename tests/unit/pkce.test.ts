import { describe, it, expect } from "vitest";
import { createVerifier, deriveChallenge } from "@/src/lib/spotify/pkce";

describe("PKCE", () => {
  it("verifier is 43-128 chars and url-safe", () => {
    const v = createVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("challenge is base64url SHA-256 of verifier with no padding", async () => {
    const verifier = "k".repeat(64);
    const challenge = await deriveChallenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toContain("=");
  });

  it("different verifiers produce different challenges", async () => {
    const a = await deriveChallenge(createVerifier());
    const b = await deriveChallenge(createVerifier());
    expect(a).not.toEqual(b);
  });
});
