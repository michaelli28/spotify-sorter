export type StepId = "intro" | "client" | "anthropic" | "prefix";

export interface SetupValues {
  clientId: string;
  anthropicKey: string;
  prefix: string;
}

// The same rules EnvSchema and POST /api/config enforce, checked before any
// request so a typo never costs a paid key check or a failed save.
export function fieldProblem(
  step: StepId,
  values: SetupValues,
): string | undefined {
  if (step === "client") {
    const n = values.clientId.length;
    if (n === 0) return "Paste the Client ID first.";
    if (n < 20)
      return `That's ${n} character${n === 1 ? "" : "s"}; a Client ID is 32.`;
  }
  if (step === "anthropic" && !values.anthropicKey.startsWith("sk-ant-"))
    return "Anthropic keys start with sk-ant-.";
  if (step === "prefix" && !values.prefix.trim())
    return "Pick at least one character.";
  return undefined;
}

export type KeyVerdict = "ok" | "rejected" | "unchecked";

// /api/llm/validate passes on the SDK's error message, which starts with the
// HTTP status for API errors ("401 {…}") and has none for connection errors.
// Only a 401/403 means the key itself is wrong.
export function keyVerdict(body: {
  ok: boolean;
  message?: string;
}): KeyVerdict {
  if (body.ok) return "ok";
  return /^40[13]\b/.test(body.message ?? "") ? "rejected" : "unchecked";
}
