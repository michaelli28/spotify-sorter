import { anthropicClient } from "./client";
import { ClassifyResponseSchema } from "./schemas";
import { costFromUsage } from "./cost";
import { logLLMCall } from "./log";

const MODEL = "claude-haiku-4-5-20251001";

export interface ClassifyCategory {
  id: string;
  name: string;
  description: string;
}
export interface ClassifyTrackInput {
  id: string;
  title: string;
  artist_name: string;
  genres: string[];
}
export interface BatchAssignment {
  track_id: string;
  matches: Array<{ category_id: string; score: number }>;
  reasoning: string;
}
export interface BatchResult {
  assignments: BatchAssignment[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  cost_usd: number;
}

function buildSystem(categories: ClassifyCategory[]): string {
  const list = categories
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n");
  return `You are classifying tracks into the user's personal categories.

For each track, return the TOP 5 categories that fit best with a 0-100 fit score, sorted highest first. Include a one-sentence "reasoning" explaining why the track lands where it does.

Use ONLY these category names exactly as written (case-sensitive):

${list}

Respond with valid JSON matching this shape:
{
  "tracks": [
    {
      "track_id": "string",
      "matches": [{ "category": "string", "score": 0-100 }],
      "reasoning": "string"
    }
  ]
}

No markdown fences. No prose outside JSON.`;
}

function buildUser(tracks: ClassifyTrackInput[]): string {
  return tracks
    .map((t) => {
      const g =
        t.genres.length > 0 ? ` [${t.genres.slice(0, 3).join(", ")}]` : "";
      return `${t.id}\t${t.title} — ${t.artist_name}${g}`;
    })
    .join("\n");
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

async function callOnce(
  apiKey: string,
  system: string,
  user: string,
  reminder: string | null,
) {
  const client = anthropicClient(apiKey);
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 16_000,
    stream: false,
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      { role: "user", content: reminder ? `${reminder}\n\n${user}` : user },
    ],
    temperature: reminder ? 0.0 : 0.3,
  });
  const text = resp.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  const u = resp.usage as AnthropicUsage;
  return { text, usage: u };
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function parseOrThrow(text: string) {
  const cleaned = stripFences(text);
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new Error(`Classify returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
  return ClassifyResponseSchema.parse(json);
}

export async function classifyBatch(opts: {
  apiKey: string;
  categories: ClassifyCategory[];
  tracks: ClassifyTrackInput[];
}): Promise<BatchResult> {
  const start = Date.now();
  const system = buildSystem(opts.categories);
  const user = buildUser(opts.tracks);
  const nameToId = new Map(opts.categories.map((c) => [c.name, c.id]));

  let retries = 0;
  let attempt = await callOnce(opts.apiKey, system, user, null);
  let parsed;
  try {
    parsed = parseOrThrow(attempt.text);
  } catch {
    retries++;
    attempt = await callOnce(
      opts.apiKey,
      system,
      user,
      "Previous response was not valid JSON. Respond with JSON only.",
    );
    parsed = parseOrThrow(attempt.text);
  }

  const assignments: BatchAssignment[] = parsed.tracks.map((t) => ({
    track_id: t.track_id,
    matches: t.matches
      .map((m) => ({ category_id: nameToId.get(m.category), score: m.score }))
      .filter((m): m is { category_id: string; score: number } =>
        Boolean(m.category_id),
      ),
    reasoning: t.reasoning,
  }));

  const cost = costFromUsage(attempt.usage);
  await logLLMCall({
    model: MODEL,
    phase: "classify",
    input_tokens: attempt.usage.input_tokens,
    output_tokens: attempt.usage.output_tokens,
    cache_read_input_tokens: attempt.usage.cache_read_input_tokens,
    cache_creation_input_tokens: attempt.usage.cache_creation_input_tokens,
    latency_ms: Date.now() - start,
    retries,
    batch_size: opts.tracks.length,
    cost_usd: cost,
  });

  return { assignments, usage: attempt.usage, cost_usd: cost };
}
