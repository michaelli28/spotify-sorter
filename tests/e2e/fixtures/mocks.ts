import type { Page } from "@playwright/test";

export async function mockSpotify(page: Page) {
  await page.route("https://api.spotify.com/v1/me", (route) =>
    route.fulfill({ json: { id: "me", display_name: "Me" } }),
  );
  await page.route("https://api.spotify.com/v1/me/playlists**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "p1",
            name: "Late Night",
            owner: { id: "me" },
            tracks: { total: 12 },
            images: [],
          },
        ],
        next: null,
      },
    }),
  );
  await page.route(
    "https://api.spotify.com/v1/playlists/p1/tracks**",
    (route) =>
      route.fulfill({
        json: {
          items: [
            {
              track: {
                id: "t1",
                name: "Self Care",
                is_local: false,
                artists: [{ id: "a1", name: "Mac Miller" }],
              },
            },
            {
              track: {
                id: "t2",
                name: "Spike",
                is_local: false,
                artists: [{ id: "a1", name: "Mac Miller" }],
              },
            },
          ],
          next: null,
        },
      }),
  );
  await page.route("https://api.spotify.com/v1/me/tracks**", (route) =>
    route.fulfill({ json: { items: [], next: null } }),
  );
  await page.route("https://api.spotify.com/v1/artists**", (route) =>
    route.fulfill({
      json: {
        artists: [{ id: "a1", name: "Mac Miller", genres: ["hip hop"] }],
      },
    }),
  );
  await page.route("https://api.spotify.com/v1/users/me/playlists", (route) =>
    route.fulfill({ json: { id: "p_new" } }),
  );
  await page.route("https://api.spotify.com/v1/playlists/*/tracks", (route) =>
    route.fulfill({ json: { snapshot_id: "s" } }),
  );
}

export async function mockAnthropic(page: Page) {
  await page.route(
    "https://api.anthropic.com/v1/messages",
    async (route, request) => {
      const body = await request.postDataJSON();
      const isClassify = (body.system?.[0]?.text ?? body.system ?? "").includes(
        "classifying tracks",
      );
      if (isClassify) {
        return route.fulfill({
          json: {
            id: "m",
            type: "message",
            role: "assistant",
            model: "claude-haiku-4-5-20251001",
            stop_reason: "end_turn",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  tracks: [
                    {
                      track_id: "t1",
                      matches: [{ category: "Aesthetic Rap", score: 90 }],
                      reasoning: "Dreamy.",
                    },
                    {
                      track_id: "t2",
                      matches: [{ category: "Aesthetic Rap", score: 80 }],
                      reasoning: "Trap.",
                    },
                  ],
                }),
              },
            ],
            usage: { input_tokens: 800, output_tokens: 300 },
          },
        });
      }
      return route.fulfill({
        json: {
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                categories: [
                  {
                    name: "Aesthetic Rap",
                    description: "Cloud rap",
                    example_track_ids: ["t1", "t2"],
                  },
                ],
              }),
            },
          ],
          usage: { input_tokens: 1500, output_tokens: 300 },
        },
      });
    },
  );
}
