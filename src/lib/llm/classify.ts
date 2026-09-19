import { anthropicClient } from "./client";
import { ClassifyResponseSchema } from "./schemas";
import { costFromUsage, type Usage } from "./cost";
import { logLLMCall } from "./log";

const MODEL = "claude-haiku-4-5-20251001";
// Fixed at 0 so repeat runs differ as little as possible and the Day 3-4 test
// can attribute decision flips to batch neighbors, not sampling.
const TEMPERATURE = 0;
const MAX_MATCHES = 5;

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
}
export interface BatchResult {
  assignments: BatchAssignment[];
  // Sent but not validly answered: left out, repeated, unknown, or no known category.
  missing: ClassifyTrackInput[];
  usage: Usage;
  cost_usd: number;
}

function buildSystem(categories: ClassifyCategory[]): string {
  const list = categories
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n");
  return `You are classifying tracks into the user's personal categories.

Each track is on its own line, starting with its number. For every track, return its number and the TOP 5 categories that fit best, each with a 0-100 fit score, highest first. Return every track exactly once.

Categories:

${list}`;
}

function buildUser(tracks: ClassifyTrackInput[]): string {
  return tracks
    .map((t, i) => {
      const g =
        t.genres.length > 0 ? ` [${t.genres.slice(0, 3).join(", ")}]` : "";
      return `${i + 1}\t${t.title} — ${t.artist_name}${g}`;
    })
    .join("\n");
}

// Tracks go out as line numbers and categories as names, both as enums, so the
// model cannot invent or mangle an ID (it used to rewrite the 22-char Spotify
// IDs). The API enforces enums but not counts or ranges; parseBatch checks those.
function outputFormat(categories: ClassifyCategory[], trackCount: number) {
  return {
    type: "json_schema" as const,
    schema: {
      type: "object",
      properties: {
        tracks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              n: {
                type: "integer",
                enum: Array.from({ length: trackCount }, (_, i) => i + 1),
              },
              matches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: {
                      type: "string",
                      enum: [...new Set(categories.map((c) => c.name))],
                    },
                    score: { type: "integer" },
                  },
                  required: ["category", "score"],
                  additionalProperties: false,
                },
              },
            },
            required: ["n", "matches"],
            additionalProperties: false,
          },
        },
      },
      required: ["tracks"],
      additionalProperties: false,
    },
  };
}

export function parseBatch(
  text: string,
  tracks: ClassifyTrackInput[],
  categories: ClassifyCategory[],
): Pick<BatchResult, "assignments" | "missing"> {
  let rows;
  try {
    rows = ClassifyResponseSchema.parse(JSON.parse(text)).tracks;
  } catch {
    // Truncated or refused output: resend the whole batch.
    return { assignments: [], missing: tracks };
  }
  const idByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const timesReturned = new Map<number, number>();
  for (const row of rows) {
    timesReturned.set(row.n, (timesReturned.get(row.n) ?? 0) + 1);
  }

  const assignments: BatchAssignment[] = [];
  const answered = new Set<number>();
  for (const row of rows) {
    const track = tracks[row.n - 1];
    // Unknown numbers are dropped; a number returned twice is ambiguous.
    if (!track || timesReturned.get(row.n) !== 1) continue;
    const best = new Map<string, number>();
    for (const m of row.matches) {
      const id = idByName.get(m.category.toLowerCase());
      if (!id || !Number.isInteger(m.score) || m.score < 0 || m.score > 100) {
        continue;
      }
      best.set(id, Math.max(best.get(id) ?? -1, m.score));
    }
    const matches = [...best]
      .map(([category_id, score]) => ({ category_id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES);
    // Zero-match guard: an empty assignment fails the cache schema and aborts
    // the whole run at writeCache, so the track is resent instead.
    if (matches.length === 0) continue;
    assignments.push({ track_id: track.id, matches });
    answered.add(row.n);
  }
  return {
    assignments,
    missing: tracks.filter((_, i) => !answered.has(i + 1)),
  };
}

export async function classifyBatch(opts: {
  apiKey: string;
  categories: ClassifyCategory[];
  tracks: ClassifyTrackInput[];
  attempt?: number;
}): Promise<BatchResult> {
  const start = Date.now();
  const resp = await anthropicClient(opts.apiKey).messages.create({
    model: MODEL,
    max_tokens: 16_000,
    temperature: TEMPERATURE,
    system: buildSystem(opts.categories),
    messages: [{ role: "user", content: buildUser(opts.tracks) }],
    output_config: {
      format: outputFormat(opts.categories, opts.tracks.length),
    },
  });
  const text = resp.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("");
  const usage = {
    input_tokens: resp.usage.input_tokens,
    output_tokens: resp.usage.output_tokens,
  };
  const cost = costFromUsage(usage);
  await logLLMCall({
    model: MODEL,
    phase: "classify",
    ...usage,
    latency_ms: Date.now() - start,
    retries: opts.attempt ?? 0,
    batch_size: opts.tracks.length,
    cost_usd: cost,
  });
  return {
    ...parseBatch(text, opts.tracks, opts.categories),
    usage,
    cost_usd: cost,
  };
}
