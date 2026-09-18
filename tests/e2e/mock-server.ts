// Stand-in for Spotify + Anthropic during e2e. The Next dev server is pointed
// here (SPOTIFY_API_BASE, SPOTIFY_ACCOUNTS_BASE, ANTHROPIC_BASE_URL), because
// Playwright's page.route only sees browser requests, never the server's own
// fetches. Unknown routes return 404 and are recorded so the spec can fail on
// any call this mock didn't expect.
import { createServer, type IncomingMessage } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 3199);
const USER = "e2e-user";
const TRACKS = [
  { id: "t1", name: "Self Care", artist: { id: "a1", name: "Mac Miller" } },
  { id: "t2", name: "Spike", artist: { id: "a1", name: "Mac Miller" } },
];

const calls: string[] = [];
const created = new Map<string, { name: string; uris: string[] }>();

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body));
  });
}

function sse(events: Array<{ type: string } & Record<string, unknown>>) {
  return events
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");
}

function spotify(method: string, path: string, body: string): unknown {
  const url = new URL(path, "http://mock");
  const p = url.pathname;
  if (method === "GET" && p === "/me") return { id: USER };
  if (method === "GET" && p === "/me/playlists") {
    return {
      items: [
        {
          id: "p1",
          name: "Late Night",
          owner: { id: USER },
          items: { total: 2 },
          images: [],
        },
        ...[...created].map(([id, pl]) => ({
          id,
          name: pl.name,
          owner: { id: USER },
          items: { total: pl.uris.length },
          images: [],
        })),
      ],
      next: null,
    };
  }
  if (method === "POST" && p === "/me/playlists") {
    const id = `new-${created.size + 1}`;
    created.set(id, {
      name: (JSON.parse(body) as { name: string }).name,
      uris: [],
    });
    return { id };
  }
  if (method === "GET" && p === "/playlists/p1") {
    return { snapshot_id: "snap-1", items: { total: 2 } };
  }
  if (method === "GET" && p === "/playlists/p1/items") {
    return {
      items: TRACKS.map((t) => ({
        item: { id: t.id, name: t.name, is_local: false, artists: [t.artist] },
      })),
      next: null,
    };
  }
  const items = /^\/playlists\/(new-\d+)\/items$/.exec(p);
  if (items && created.has(items[1]!)) {
    const pl = created.get(items[1]!)!;
    if (method === "POST") {
      pl.uris.push(...(JSON.parse(body) as { uris: string[] }).uris);
      return { snapshot_id: `snap-${pl.uris.length}` };
    }
    return {
      items: pl.uris.map((u) => ({ item: { id: u.split(":").pop() } })),
      next: null,
    };
  }
  if (method === "GET" && p === "/me/tracks") {
    return url.searchParams.get("limit") === "1"
      ? { total: 0, items: [] }
      : { items: [], next: null };
  }
  if (method === "GET" && p === "/artists") {
    return { artists: [{ id: "a1", name: "Mac Miller", genres: ["hip hop"] }] };
  }
  return undefined;
}

function anthropic(body: string): { type: string; payload: string } {
  const req = JSON.parse(body) as {
    stream?: boolean;
    messages: Array<{ content: string }>;
    output_config?: {
      format: {
        schema: {
          properties: {
            tracks: {
              items: {
                properties: {
                  matches: {
                    items: { properties: { category: { enum: string[] } } };
                  };
                };
              };
            };
          };
        };
      };
    };
  };
  if (req.stream) {
    // Propose streams its reply.
    const text = JSON.stringify({
      categories: [
        {
          name: "Aesthetic Rap",
          description: "Cloud rap",
          example_track_ids: ["t1", "t2"],
        },
      ],
    });
    return {
      type: "text/event-stream",
      payload: sse([
        {
          type: "message_start",
          message: {
            id: "msg_e2e",
            type: "message",
            role: "assistant",
            model: "claude-haiku-4-5-20251001",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1500, output_tokens: 0 },
          },
        },
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 300 },
        },
        { type: "message_stop" },
      ]),
    };
  }
  // Classify: answer every numbered line with the first allowed category.
  const category =
    req.output_config!.format.schema.properties.tracks.items.properties.matches
      .items.properties.category.enum[0]!;
  const rows = req.messages[0]!.content.split("\n")
    .filter((line) => line.includes("\t"))
    .map((line) => ({
      n: Number(line.split("\t")[0]),
      matches: [{ category, score: 90 }],
    }));
  return {
    type: "application/json",
    payload: JSON.stringify({
      id: "msg_e2e",
      type: "message",
      role: "assistant",
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ tracks: rows }) }],
      usage: { input_tokens: 800, output_tokens: 200 },
    }),
  };
}

createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const path = req.url ?? "/";
  const body = await readBody(req);
  if (path === "/__health") return res.end("ok");
  if (path === "/__calls") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(calls));
  }
  calls.push(`${method} ${path.split("?")[0]}`);

  if (path.startsWith("/spotify/v1/")) {
    const result = spotify(method, path.slice("/spotify/v1".length), body);
    if (result !== undefined) {
      res.writeHead(method === "POST" ? 201 : 200, {
        "content-type": "application/json",
      });
      return res.end(JSON.stringify(result));
    }
  }
  if (method === "POST" && path === "/anthropic/v1/messages") {
    const { type, payload } = anthropic(body);
    res.writeHead(200, { "content-type": type });
    return res.end(payload);
  }
  calls.push(`UNMATCHED ${method} ${path}`);
  res.writeHead(404, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ error: `e2e mock has no route for ${method} ${path}` }),
  );
}).listen(PORT, "127.0.0.1");
