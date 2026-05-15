import { z } from "zod";
import { anthropicClient } from "./client";
import { costFromUsage } from "./cost";
import { logLLMCall } from "./log";

const MODEL = "claude-haiku-4-5-20251001";

const ReclassifySchema = z.object({
  scores: z.array(
    z.object({ track_id: z.string(), score: z.number().int().min(0).max(100) }),
  ),
});

export interface ReclassifyOpts {
  apiKey: string;
  category: { id: string; name: string; description: string };
  tracks: Array<{
    id: string;
    title: string;
    artist_name: string;
    genres: string[];
  }>;
}

export interface ReclassifyResult {
  scores: Array<{ track_id: string; score: number }>;
  cost_usd: number;
}

export async function reclassifyAgainstCategory(
  opts: ReclassifyOpts,
): Promise<ReclassifyResult> {
  const start = Date.now();
  const system = `You are scoring how well each track fits ONE specific category on a 0-100 scale.

Category: ${opts.category.name}
Description: ${opts.category.description}

Return JSON only: { "scores": [ { "track_id": "string", "score": 0-100 } ] }`;

  const user = opts.tracks
    .map((t) => {
      const g = t.genres.length ? ` [${t.genres.slice(0, 3).join(", ")}]` : "";
      return `${t.id}\t${t.title} — ${t.artist_name}${g}`;
    })
    .join("\n");

  const client = anthropicClient(opts.apiKey);
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4_000,
    system,
    messages: [{ role: "user", content: user }],
    temperature: 0.2,
    stream: false,
  });
  const text = resp.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  const parsed = ReclassifySchema.parse(JSON.parse(text));
  const cost = costFromUsage(resp.usage);

  await logLLMCall({
    model: MODEL,
    phase: "reclassify",
    input_tokens: resp.usage.input_tokens,
    output_tokens: resp.usage.output_tokens,
    latency_ms: Date.now() - start,
    retries: 0,
    batch_size: opts.tracks.length,
    cost_usd: cost,
  });

  return { scores: parsed.scores, cost_usd: cost };
}
