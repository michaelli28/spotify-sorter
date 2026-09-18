// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetEnvForTests } from "@/src/lib/config/env";

vi.mock("@/src/lib/pipeline/classify", () => ({
  runClassifyFromCache: vi.fn(async () => ({
    tracks_classified: 0,
    cost_usd: 0,
  })),
}));
vi.mock("@/src/lib/pipeline/propose", () => ({
  runProposeFromCache: vi.fn(async () => ({ categories: [], cost_usd: 0 })),
}));
vi.mock("@/src/lib/pipeline/reclassify", () => ({
  runReclassifyForNewCategories: vi.fn(async () => ({
    tracks_updated: 0,
    cost_usd: 0,
  })),
}));
vi.mock("@/src/lib/pipeline/apply", () => ({
  runApplyFromCache: vi.fn(async () => ({
    created: 0,
    updated: 0,
    tracks_added: 0,
    playlists: [],
  })),
}));

import { runClassifyFromCache } from "@/src/lib/pipeline/classify";
import { runProposeFromCache } from "@/src/lib/pipeline/propose";
import { runReclassifyForNewCategories } from "@/src/lib/pipeline/reclassify";
import { runApplyFromCache } from "@/src/lib/pipeline/apply";
import { GET as classifyGET } from "@/app/api/llm/classify/route";
import { GET as proposeGET } from "@/app/api/llm/propose/route";
import { POST as reclassifyPOST } from "@/app/api/llm/reclassify/route";
import { POST as applyPOST } from "@/app/api/spotify/apply/route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
  process.env.ANTHROPIC_API_KEY = "sk-ant-x";
  _resetEnvForTests();
});

function req(path: string, site: string | null, method = "GET"): Request {
  const headers: Record<string, string> = {
    cookie: "sorter_access_token=AT",
    "content-type": "application/json",
  };
  if (site) headers["sec-fetch-site"] = site;
  return new Request(`http://127.0.0.1:3000${path}`, {
    method,
    headers,
    body:
      method === "POST"
        ? JSON.stringify({ newCategoryIds: ["c1"] })
        : undefined,
  });
}

// Routes that spend Anthropic money or write to Spotify.
const ROUTES = [
  {
    name: "classify",
    call: (r: Request) => classifyGET(r),
    path: "/api/llm/classify",
    method: "GET",
    run: () => runClassifyFromCache,
  },
  {
    name: "propose",
    call: (r: Request) => proposeGET(r),
    path: "/api/llm/propose",
    method: "GET",
    run: () => runProposeFromCache,
  },
  {
    name: "reclassify",
    call: (r: Request) => reclassifyPOST(r),
    path: "/api/llm/reclassify",
    method: "POST",
    run: () => runReclassifyForNewCategories,
  },
  {
    name: "apply",
    call: (r: Request) => applyPOST(r),
    path: "/api/spotify/apply",
    method: "POST",
    run: () => runApplyFromCache,
  },
];

describe.each(ROUTES)("$name route", ({ call, path, method, run }) => {
  it.each(["cross-site", "same-site"])(
    "rejects a %s browser request (another website or port) before doing anything",
    async (site) => {
      const res = await call(req(path, site, method));
      expect(res.status).toBe(403);
      expect(vi.mocked(run())).not.toHaveBeenCalled();
    },
  );

  it.each(["same-origin", "none", null])(
    "allows the app's own pages, typed URLs and non-browser clients (%s)",
    async (site) => {
      const res = await call(req(path, site, method));
      expect(res.status).toBe(200);
      await res.text();
      expect(vi.mocked(run())).toHaveBeenCalledTimes(1);
    },
  );
});
