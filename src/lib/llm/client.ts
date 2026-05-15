import Anthropic from "@anthropic-ai/sdk";

export type ValidateResult = { ok: true } | { ok: false; message: string };

export async function validateAnthropicKey(
  apiKey: string,
): Promise<ValidateResult> {
  const client = new Anthropic({ apiKey });
  try {
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: msg };
  }
}

export function anthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}
