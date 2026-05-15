import { withSpotify } from "@/src/lib/spotify/client";
import { runScan } from "@/src/lib/pipeline/scan";

export const dynamic = "force-dynamic";

function parseSession(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /sorter_access_token=([^;]+)/.exec(cookie);
  return m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
}

export async function GET(req: Request) {
  const session = parseSession(req);
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        const result = await withSpotify(session, (token) =>
          runScan({
            accessToken: token,
            onProgress: (stage, current, total) =>
              send("progress", { stage, current, total }),
          }),
        );
        send("done", result);
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
