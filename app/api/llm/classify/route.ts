import { env } from "@/src/lib/config/env";
import { runClassifyFromCache } from "@/src/lib/pipeline/classify";

export const dynamic = "force-dynamic";

export async function GET() {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        const r = await runClassifyFromCache({
          apiKey: env().ANTHROPIC_API_KEY,
          onProgress: (stage, done, total) =>
            send("progress", { stage, done, total }),
        });
        send("done", r);
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "unknown",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
