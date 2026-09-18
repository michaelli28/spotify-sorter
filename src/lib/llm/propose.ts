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

export interface ProposeProgress {
  output_tokens: number;
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
  onProgress?: (state: ProposeProgress) => void,
): Promise<{
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const client = anthropicClient(apiKey);
  const userMsg = reminder
    ? `${reminder}\n\n${buildUserMessage(tracks)}`
    : buildUserMessage(tracks);
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16_000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
    temperature: reminder ? 0.0 : 0.4,
  });
  for await (const event of stream) {
    if (event.type === "message_delta" && event.usage) {
      try {
        onProgress?.({ output_tokens: event.usage.output_tokens });
      } catch {
        // Progress reporting must never abort the LLM call (e.g. client
        // disconnected the SSE stream). Persistence happens after this loop.
      }
    }
  }
  const final = await stream.finalMessage();
  const text = final.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  return {
    text,
    usage: {
      input_tokens: final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
    },
  };
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
    throw new Error(`Propose returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
  return ProposeResponseSchema.parse(json);
}

export async function runPropose(opts: {
  apiKey: string;
  tracks: ProposeTrackInput[];
  onProgress?: (state: ProposeProgress) => void;
}): Promise<ProposeResult> {
  let cost = 0;
  // Every call is logged and charged, including a first reply that failed to parse.
  const callAndLog = async (reminder: string | null, retries: number) => {
    const start = Date.now();
    const attempt = await callOnce(
      opts.apiKey,
      opts.tracks,
      reminder,
      opts.onProgress,
    );
    const callCost = costFromUsage(attempt.usage);
    cost += callCost;
    await logLLMCall({
      model: MODEL,
      phase: "propose",
      input_tokens: attempt.usage.input_tokens,
      output_tokens: attempt.usage.output_tokens,
      latency_ms: Date.now() - start,
      retries,
      batch_size: null,
      cost_usd: callCost,
    });
    return attempt;
  };

  // Only an unparseable reply is resent; API or logging errors propagate.
  const first = await callAndLog(null, 0);
  let parsed;
  try {
    parsed = parseOrThrow(first.text);
  } catch {
    parsed = parseOrThrow(
      (
        await callAndLog(
          "Your previous response was not valid JSON. Respond with valid JSON ONLY, no markdown fences or prose.",
          1,
        )
      ).text,
    );
  }
  return {
    categories: parsed.categories.map((c) => ({
      ...c,
      id: randomBytes(8).toString("hex"),
    })),
    cost_usd: cost,
  };
}
