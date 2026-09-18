import type { Job } from "./single-flight";

// Streams a job as SSE: `progress` events, then one `done` or `error`. A client
// disconnect only unsubscribes; the job keeps running so its cache writes land.
export function jobEventStream<P, R>(job: Job<P, R>): Response {
  const enc = new TextEncoder();
  let unsubscribe = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Stream already closed by the client.
        }
      };
      unsubscribe = job.subscribe((progress) => send("progress", progress));
      try {
        send("done", await job.result);
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "unknown",
        });
      } finally {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
