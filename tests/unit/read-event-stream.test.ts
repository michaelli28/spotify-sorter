// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readEventStream } from "@/src/lib/client/read-event-stream";

function streamOf(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("readEventStream", () => {
  it("parses SSE events even when a chunk splits an event", async () => {
    const seen: Array<[string, unknown]> = [];
    await readEventStream(
      streamOf([
        'event: progress\ndata: {"done":1,',
        '"total":2}\n\nevent: done\ndata: {"created":3}\n\n',
      ]),
      (event, data) => seen.push([event, data]),
    );
    expect(seen).toEqual([
      ["progress", { done: 1, total: 2 }],
      ["done", { created: 3 }],
    ]);
  });

  it("throws on a non-2xx response instead of reading it as events", async () => {
    await expect(
      readEventStream(streamOf(["Method Not Allowed"], 405), () => {}),
    ).rejects.toThrow(/405/);
  });
});
