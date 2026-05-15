import { test, expect } from "@playwright/test";
import { mockSpotify, mockAnthropic } from "./fixtures/mocks";

test("happy path: connect → scope → scan → review → classify → apply", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "sorter_access_token",
      value: "E2E_TOKEN",
      url: "http://127.0.0.1:3000",
    },
  ]);
  await mockSpotify(page);
  await mockAnthropic(page);

  await page.goto("/scope");
  await expect(
    page.getByRole("heading", { name: /What should I read/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Scan" }).click();

  await expect(page).toHaveURL(/\/review|\/scan/);
  await page.waitForURL("/review", { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: /categories\. Edit anything/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Classify" }).click();
  await page.getByRole("button", { name: "Proceed" }).click();

  await page.waitForURL("/classify", { timeout: 60_000 });
  await page.getByRole("button", { name: "Apply to Spotify" }).click();

  await page.waitForURL("/apply", { timeout: 30_000 });
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page.getByText(/new playlists|Updated/i)).toBeVisible({
    timeout: 30_000,
  });
});
