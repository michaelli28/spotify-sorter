import { randomBytes } from "node:crypto";
import { anthropicClient } from "./client";
import { ProposeResponseSchema, type ProposedCategory } from "./schemas";
import { costFromUsage } from "./cost";
import { logLLMCall } from "./log";

export interface ProposeTrackInput {
  id: string;
  title: string;
  artist_name: string;
  genres: string[];
}

export interface ProposeResult {
  categories: Array<ProposedCategory & { id: string }>;
  cost_usd: number;
}

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a sharp-eared music curator helping the user organize their personal Spotify library into themed playlists.

You will receive a list of tracks (title + artist + Spotify-tagged genres). Invent 25-35 specific, vibey sub-genre/mood category names that fit the library you see. Each category should:

- Be specific (not "Rap" or "Chill" — instead "Aesthetic Rap", "Late-Night R&B", "Sad Slow")
- Reflect actual clusters in the library (don't invent categories for genres not represented)
- Use Title Case
- Have a 1-2 sentence description capturing the feel
- Include 3-8 example_track_ids of tracks that fit best

Respond with valid JSON ONLY, matching this schema:
{
  "categories": [
    { "name": "string", "description": "string", "example_track_ids": ["string"] }
  ]
}

Do not wrap in markdown fences. Do not add any prose outside the JSON.`;

function buildUserMessage(tracks: ProposeTrackInput[]): string {
  const lines = tracks.map((t) => {
    const genres =
      t.genres.length > 0 ? ` [${t.genres.slice(0, 3).join(", ")}]` : "";
    return `${t.id}\t${t.title} — ${t.artist_name}${genres}`;
  });
  return `Library (${tracks.length} tracks):\n\n${lines.join("\n")}\n\nReturn JSON only.`;
}

async function callOnce(
  apiKey: string,
  tracks: ProposeTrackInput[],
  reminder: string | null,
): Promise<{
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const client = anthropicClient(apiKey);
  const userMsg = reminder
    ? `${reminder}\n\n${buildUserMessage(tracks)}`
    : buildUserMessage(tracks);
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 8_000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
    temperature: reminder ? 0.0 : 0.4,
    stream: false,
  });
  const text = resp.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  return {
    text,
    usage: {
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
    },
  };
}

function parseOrThrow(text: string) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Propose returned non-JSON: ${text.slice(0, 200)}`);
  }
  return ProposeResponseSchema.parse(json);
}

export async function runPropose(opts: {
  apiKey: string;
  tracks: ProposeTrackInput[];
}): Promise<ProposeResult> {
  const start = Date.now();
  let attempt = await callOnce(opts.apiKey, opts.tracks, null);
  let retries = 0;
  let parsed;
  try {
    parsed = parseOrThrow(attempt.text);
  } catch {
    retries = 1;
    attempt = await callOnce(
      opts.apiKey,
      opts.tracks,
      "Your previous response was not valid JSON. Respond with valid JSON ONLY, no markdown fences or prose.",
    );
    parsed = parseOrThrow(attempt.text);
  }
  const cost = costFromUsage(attempt.usage);
  await logLLMCall({
    model: MODEL,
    phase: "propose",
    input_tokens: attempt.usage.input_tokens,
    output_tokens: attempt.usage.output_tokens,
    latency_ms: Date.now() - start,
    retries,
    batch_size: null,
    cost_usd: cost,
  });
  return {
    categories: parsed.categories.map((c) => ({
      ...c,
      id: randomBytes(8).toString("hex"),
    })),
    cost_usd: cost,
  };
}
