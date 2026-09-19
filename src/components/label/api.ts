import type { LabelInput, LabelState } from "@/src/lib/labeling/schema";

export const RELOAD_MESSAGE =
  "Definitions changed since this page loaded. Reload.";

const ERROR_TEXT: Record<string, string> = {
  no_sample: "No sample yet. Run scripts/label-sample.ts first.",
  no_definitions: "No definitions yet. Write data/labels/definitions.md first.",
  relabel_not_open: "This relabel isn't open yet.",
};

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

// Error bodies are JSON {error, message?}; the cross-site guard sends text.
async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof body.error === "string" && ERROR_TEXT[body.error]) {
      return ERROR_TEXT[body.error]!;
    }
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  } catch {
    // Not JSON: fall through to the raw text.
  }
  return text || `HTTP ${res.status}`;
}

function networkMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function loadLabelState(): Promise<Result<LabelState>> {
  try {
    const res = await fetch("/api/label", { cache: "no-store" });
    if (!res.ok) return { ok: false, message: await errorMessage(res) };
    return { ok: true, value: (await res.json()) as LabelState };
  } catch (e) {
    return { ok: false, message: networkMessage(e) };
  }
}

export async function postLabel(input: LabelInput): Promise<Result<null>> {
  try {
    const res = await fetch("/api/label", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.status === 409) return { ok: false, message: RELOAD_MESSAGE };
    if (!res.ok) return { ok: false, message: await errorMessage(res) };
    return { ok: true, value: null };
  } catch (e) {
    return { ok: false, message: networkMessage(e) };
  }
}
