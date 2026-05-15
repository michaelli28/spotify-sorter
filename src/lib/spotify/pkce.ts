import { createHash, randomBytes } from "node:crypto";

export function createVerifier(): string {
  return randomBytes(64).toString("base64url").slice(0, 128);
}

export async function deriveChallenge(verifier: string): Promise<string> {
  return createHash("sha256").update(verifier).digest("base64url");
}
