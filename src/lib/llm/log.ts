import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "@/src/lib/config/paths";

export interface LLMLogEntry {
  model: string;
  phase: "propose" | "classify" | "reclassify" | "validate";
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  latency_ms: number;
  retries: number;
  batch_size: number | null;
  cost_usd: number;
}

export async function logLLMCall(entry: LLMLogEntry): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const path = join(dataDir(), "logs", `llm-${today}.jsonl`);
  await mkdir(join(dataDir(), "logs"), { recursive: true });
  const line =
    JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n";
  await appendFile(path, line, "utf-8");
}
