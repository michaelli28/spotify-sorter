import { withSpotify, type Session } from "@/src/lib/spotify/client";
import { rejectCrossSite } from "@/src/lib/http/same-origin";
import { runApplyFromCache } from "@/src/lib/pipeline/apply";
import { singleFlight } from "@/src/lib/pipeline/single-flight";
import { jobEventStream } from "@/src/lib/pipeline/event-stream";

export const dynamic = "force-dynamic";

function parseSession(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /sorter_access_token=([^;]+)/.exec(cookie);
  return m
    ? { accessToken: m[1]!, accessTokenExpiresAt: Date.now() + 60_000 }
    : undefined;
}

type ApplyProgress = {
  stage: "category";
  done: number;
  total: number;
  name?: string;
};

// A second POST (e.g. a double-click on Apply) joins the running write
// instead of creating every playlist a second time.
const applyJob = singleFlight(
  (emit: (p: ApplyProgress) => void, session: Session | undefined) =>
    withSpotify(session, (token) =>
      runApplyFromCache({
        accessToken: token,
        onProgress: (stage, done, total, name) =>
          emit({ stage, done, total, name }),
      }),
    ),
);

export async function POST(req: Request) {
  return rejectCrossSite(req) ?? jobEventStream(applyJob(parseSession(req)));
}
