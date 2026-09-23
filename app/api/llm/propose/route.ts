import {
  runProposeFromCache,
  type ProposeFromCacheProgress,
} from "@/src/lib/pipeline/propose";
import { rejectUnlessFromApp } from "@/src/lib/http/same-origin";
import { env } from "@/src/lib/config/env";
import { singleFlight } from "@/src/lib/pipeline/single-flight";
import { jobEventStream } from "@/src/lib/pipeline/event-stream";

export const dynamic = "force-dynamic";

const proposeJob = singleFlight((emit: (p: ProposeFromCacheProgress) => void) =>
  runProposeFromCache({
    apiKey: env().ANTHROPIC_API_KEY,
    onProgress: emit,
  }).catch((err: unknown) => {
    console.error(
      "[propose] failed:",
      err instanceof Error ? err.message : "unknown",
      err,
    );
    throw err;
  }),
);

export async function GET(req: Request) {
  return rejectUnlessFromApp(req) ?? jobEventStream(proposeJob());
}
