// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("@/src/lib/pipeline/apply", () => ({ runApplyFromCache: vi.fn() }));

import { runApplyFromCache } from "@/src/lib/pipeline/apply";
import { POST } from "@/app/api/spotify/apply/route";

const applyMock = vi.mocked(runApplyFromCache);
const tick = () => new Promise((r) => setTimeout(r, 0));

function post(): Promise<Response> {
  return POST(
    new Request("http://127.0.0.1:3000/api/spotify/apply", {
      method: "POST",
      headers: { cookie: "sorter_access_token=AT" },
    }),
  );
}

describe("POST /api/spotify/apply", () => {
  it("joins a running apply instead of creating every playlist twice", async () => {
    let finish!: () => void;
    applyMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({ created: 1, updated: 0, tracks_added: 2, playlists: [] });
        }),
    );

    const first = await post();
    await tick();
    const second = await post();
    await tick();
    finish();

    const [a, b] = await Promise.all([
      new Response(first.body).text(),
      new Response(second.body).text(),
    ]);
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(a).toContain('event: done\ndata: {"created":1');
    expect(b).toContain('event: done\ndata: {"created":1');
  });
});
