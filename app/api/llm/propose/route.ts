import { runProposeFromCache } from "@/src/lib/pipeline/propose";
import { env } from "@/src/lib/config/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          // Stream is closed (client disconnect). Keep the work running so the
          // pipeline still writes categories to cache.
        }
      };
      try {
        const result = await runProposeFromCache({
          apiKey: env().ANTHROPIC_API_KEY,
          onProgress: (state) => send("progress", state),
        });
        send("done", result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        console.error("[propose] failed:", message, err);
        send("error", { message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
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
