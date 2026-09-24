import { test, expect } from "@playwright/test";

const MOCK = "http://127.0.0.1:3199";

test("happy path: scope → scan → review → classify → apply → sync → remove", async ({
  page,
  context,
  request,
}) => {
  // Two Applies and a removal on top of the run: more than the default minute.
  test.setTimeout(120_000);
  await context.addCookies([
    {
      name: "sorter_access_token",
      value: "E2E_TOKEN",
      url: "http://127.0.0.1:3100",
    },
  ]);
  // Each run-starting stream must open once per visit: a second open of
  // classify or propose is a second paid run.
  const streams: string[] = [];
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (/^\/api\/(spotify\/(scan|apply)|llm\/(propose|classify))$/.test(path)) {
      streams.push(`${r.method()} ${path}`);
    }
  });

  await page.goto("/scope");
  await expect(
    page.getByRole("heading", { name: /What should I read/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Scan", exact: true }).click();

  await page.waitForURL("/review", { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: /categories\. Edit anything/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Classify", exact: true }).click();
  await page.getByRole("button", { name: "Proceed", exact: true }).click();

  await page.waitForURL("/classify", { timeout: 60_000 });
  await page.getByRole("button", { name: "Apply to Spotify" }).click();

  await page.waitForURL("/apply", { timeout: 30_000 });
  await page.getByRole("button", { name: "Apply", exact: true }).click();

  await expect(page.getByText("2 tracks placed.")).toBeVisible({
    timeout: 30_000,
  });

  const calls = (await (
    await request.get(`${MOCK}/__calls`)
  ).json()) as string[];
  expect(calls.filter((c) => c.startsWith("UNMATCHED"))).toEqual([]);
  expect(calls).toContain("POST /spotify/v1/me/playlists");
  expect(calls).toContain("POST /spotify/v1/playlists/new-1/items");
  expect(calls.filter((c) => c.includes("/accounts/"))).toEqual([]);
  expect(streams).toEqual([
    "GET /api/spotify/scan",
    "GET /api/llm/propose",
    "GET /api/llm/classify",
    "POST /api/spotify/apply",
  ]);
  // One propose call + one classify batch (2 tracks): nothing billed twice.
  expect(calls.filter((c) => c.startsWith("POST /anthropic"))).toHaveLength(2);

  // Spec §8.1: the next Apply makes the playlist match exactly, so a track
  // added by hand in Spotify comes out in one PUT. The remove action shows
  // once the covers have settled, so nothing else is writing the cache.
  const removeAction = page.getByRole("button", {
    name: "Remove SpotifySorter playlists…",
  });
  await expect(removeAction).toBeVisible({ timeout: 30_000 });
  const handAdd = await request.post(`${MOCK}/__hand-add`, {
    data: { playlist: "new-1", uris: ["spotify:track:hand1"] },
  });
  expect(handAdd.ok()).toBe(true);
  await page.goto("/apply");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("1 track removed.")).toBeVisible({
    timeout: 30_000,
  });
  const synced = (await (
    await request.get(`${MOCK}/__calls`)
  ).json()) as string[];
  expect(synced).toContain("GET /spotify/v1/playlists/new-1/items");
  expect(synced).toContain("PUT /spotify/v1/playlists/new-1/items");

  // Spec §8.2: remove every SpotifySorter playlist, then the page shows
  // nothing on Spotify.
  await expect(removeAction).toBeVisible({ timeout: 30_000 });
  await removeAction.click();
  const tag = page.getByRole("dialog", {
    name: "Remove SpotifySorter playlists",
  });
  await tag.getByRole("button", { name: "Remove 1 playlist" }).click();
  await expect(tag.getByText("1 playlist removed.")).toBeVisible({
    timeout: 30_000,
  });
  const removals = (await (
    await request.get(`${MOCK}/__library-removals`)
  ).json()) as string[];
  expect(removals).toEqual(["spotify:playlist:new-1"]);
  await tag.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("heading", { name: "What Apply writes" }),
  ).toBeVisible();

  const after = (await (
    await request.get(`${MOCK}/__calls`)
  ).json()) as string[];
  expect(after.filter((c) => c.startsWith("UNMATCHED"))).toEqual([]);
  expect(after.filter((c) => c.includes("/accounts/"))).toEqual([]);
  expect(streams.filter((s) => s === "POST /api/spotify/apply")).toHaveLength(
    2,
  );
});
