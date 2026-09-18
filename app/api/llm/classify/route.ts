import { env } from "@/src/lib/config/env";
import { rejectCrossSite } from "@/src/lib/http/same-origin";
import { runClassifyFromCache } from "@/src/lib/pipeline/classify";
import { singleFlight } from "@/src/lib/pipeline/single-flight";
import { jobEventStream } from "@/src/lib/pipeline/event-stream";

export const dynamic = "force-dynamic";

const classifyJob = singleFlight(
  (emit: (p: { stage: "batch"; done: number; total: number }) => void) =>
    runClassifyFromCache({
      apiKey: env().ANTHROPIC_API_KEY,
      onProgress: (stage, done, total) => emit({ stage, done, total }),
    }),
);

export async function GET(req: Request) {
  return rejectCrossSite(req) ?? jobEventStream(classifyJob());
}
