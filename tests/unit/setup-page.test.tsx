import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import SetupPage from "@/app/setup/page";

const CLIENT_ID = "0123456789abcdef0123456789abcdef";
const KEY = "sk-ant-api03-test-key";
const REDIRECT_URI = "http://127.0.0.1:3000/api/auth/callback";

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
type Handler = (init?: RequestInit) => Promise<Reply>;

const reply =
  (body: unknown, status = 200): Handler =>
  async () => ({ ok: status < 300, status, json: async () => body });

function deferred() {
  let resolve!: (r: Reply) => void;
  const promise = new Promise<Reply>((r) => (resolve = r));
  return { promise, resolve };
}

function stubFetch(handlers: Record<string, Handler> = {}) {
  const all: Record<string, Handler> = {
    "GET /api/config": reply({ configured: false }),
    ...handlers,
  };
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${String(input)}`;
      const handler = all[key];
      if (!handler) throw new Error(`unexpected fetch ${key}`);
      return handler(init);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof stubFetch>, key: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) => `${init?.method ?? "GET"} ${String(input)}` === key,
  );

const heading = (name: string) =>
  screen.findByRole("heading", { level: 1, name });

async function toClientStep(user: UserEvent) {
  render(<SetupPage />);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await heading("Paste its Client ID.");
  return screen.getByRole("textbox", { name: "Spotify Client ID" });
}

async function toKeyStep(user: UserEvent) {
  const field = await toClientStep(user);
  await user.click(field);
  await user.paste(CLIENT_ID);
  await user.keyboard("{Enter}");
  await heading("Paste an Anthropic key.");
  return screen.getByLabelText("Anthropic API key");
}

async function toPrefixStep(user: UserEvent) {
  const field = await toKeyStep(user);
  await user.click(field);
  await user.paste(KEY);
  await user.keyboard("{Enter}");
  await heading("Prefix the new playlists.");
  return screen.getByRole("textbox", { name: "Playlist prefix" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  router.push.mockReset();
  router.replace.mockReset();
});

describe("/setup", () => {
  it("sends a configured user home without adding a history entry", async () => {
    stubFetch({ "GET /api/config": reply({ configured: true }) });
    render(<SetupPage />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("opens on the Spotify app step, with no way back from it", async () => {
    stubFetch();
    render(<SetupPage />);
    expect(await heading("Make a Spotify app.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    const steps = within(screen.getByRole("list", { name: "Setup" }));
    const current = steps
      .getAllByRole("listitem")
      .filter((li) => li.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Spotify app");
  });

  it("copies the redirect URI exactly", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<SetupPage />);
    expect(screen.getByText(REDIRECT_URI)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe(REDIRECT_URI);
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("submits on Enter and refuses a short Client ID without leaving the step", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    const field = await toClientStep(user);
    await user.type(field, "abc123{Enter}");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      "That's 6 characters; a Client ID is 32.",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Paste its Client ID." }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the config check
  });

  it("trims a pasted Client ID and moves on, focusing the next field", async () => {
    stubFetch();
    const user = userEvent.setup();
    const field = await toClientStep(user);
    await waitFor(() => expect(field).toHaveFocus());
    await user.paste(`  ${CLIENT_ID}\n`);
    expect(field).toHaveValue(CLIENT_ID);
    await user.keyboard("{Enter}");
    await heading("Paste an Anthropic key.");
    await waitFor(() =>
      expect(screen.getByLabelText("Anthropic API key")).toHaveFocus(),
    );
  });

  it("goes back a step with what was typed kept", async () => {
    stubFetch();
    const user = userEvent.setup();
    await toKeyStep(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await heading("Paste its Client ID.");
    expect(
      screen.getByRole("textbox", { name: "Spotify Client ID" }),
    ).toHaveValue(CLIENT_ID);
  });

  it("keeps focus on Continue after going back to the first step", async () => {
    stubFetch();
    const user = userEvent.setup();
    await toClientStep(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    await heading("Make a Spotify app.");
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
  });

  it("checks the key's shape locally before any paid call", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    const field = await toKeyStep(user);
    await user.type(field, "abc{Enter}");
    expect(field).toHaveAccessibleDescription(
      "Anthropic keys start with sk-ant-.",
    );
    expect(calls(fetchMock, "POST /api/llm/validate")).toHaveLength(0);
  });

  it("checks the key once, locked while it waits, then moves on", async () => {
    const pending = deferred();
    const fetchMock = stubFetch({
      "POST /api/llm/validate": () => pending.promise,
    });
    const user = userEvent.setup();
    const field = await toKeyStep(user);
    await user.click(field);
    await user.paste(KEY);
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(field).toHaveAttribute("readonly");
    await user.keyboard("{Enter}");
    const validates = calls(fetchMock, "POST /api/llm/validate");
    expect(validates).toHaveLength(1);
    expect(JSON.parse(String(validates[0][1]?.body))).toEqual({ apiKey: KEY });

    pending.resolve({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    expect(await heading("Prefix the new playlists.")).toBeInTheDocument();
  });

  it("says the key was rejected only when Anthropic rejected it", async () => {
    stubFetch({
      "POST /api/llm/validate": reply({
        ok: false,
        message:
          '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
      }),
    });
    const user = userEvent.setup();
    const field = await toKeyStep(user);
    await user.click(field);
    await user.paste(KEY);
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(field).toHaveAccessibleDescription("Anthropic rejected that key."),
    );
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it.each([
    [
      "the request never arrived",
      () => Promise.reject(new TypeError("Failed to fetch")),
    ],
    [
      "Anthropic was unreachable",
      reply({ ok: false, message: "Connection error." }),
    ],
    [
      "Anthropic was overloaded",
      reply({ ok: false, message: "529 Overloaded" }),
    ],
  ])("offers Try again, with the key kept, when %s", async (_, validate) => {
    const fetchMock = stubFetch({
      "POST /api/llm/validate": validate as Handler,
    });
    const user = userEvent.setup();
    const field = await toKeyStep(user);
    await user.click(field);
    await user.paste(KEY);
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't check the key with Anthropic.",
    );
    // Not the key's fault, so the field is not marked wrong.
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(field).toHaveValue(KEY);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(calls(fetchMock, "POST /api/llm/validate")).toHaveLength(2);
  });

  it("drops the last failure while it checks or saves again", async () => {
    const recheck = deferred();
    const resave = deferred();
    let validates = 0;
    let saves = 0;
    stubFetch({
      "POST /api/llm/validate": () =>
        ++validates === 1
          ? reply({ ok: false, message: "Connection error." })()
          : recheck.promise,
      "POST /api/config": () =>
        ++saves === 1 ? reply({ error: {} }, 400)() : resave.promise,
    });
    const user = userEvent.setup();
    const field = await toKeyStep(user);
    await user.click(field);
    await user.paste(KEY);
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();

    recheck.resolve({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await heading("Prefix the new playlists.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Couldn't save the settings.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("drops a stale error and Try again once the key is edited", async () => {
    stubFetch({
      "POST /api/llm/validate": reply({
        ok: false,
        message: "Connection error.",
      }),
    });
    const user = userEvent.setup();
    const field = await toKeyStep(user);
    await user.click(field);
    await user.paste(KEY);
    await user.keyboard("{Enter}");
    await screen.findByRole("button", { name: "Try again" });
    await user.type(field, "x");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("caps the prefix at the server's 8 characters and previews it", async () => {
    stubFetch({ "POST /api/llm/validate": reply({ ok: true }) });
    const user = userEvent.setup();
    const field = await toPrefixStep(user);
    expect(field).toHaveAttribute("maxLength", "8");
    expect(field).toHaveValue("✨");
    expect(screen.getByText("✨ Aesthetic Rap")).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, "AI");
    expect(screen.getByText("AI Aesthetic Rap")).toBeInTheDocument();
    expect(screen.queryByText(/later in Settings/i)).toBeNull();
    expect(screen.queryByText(/Liked Songs/)).toBeNull();
  });

  it("refuses an empty prefix without saving", async () => {
    const fetchMock = stubFetch({
      "POST /api/llm/validate": reply({ ok: true }),
    });
    const user = userEvent.setup();
    const field = await toPrefixStep(user);
    await user.clear(field);
    await user.type(field, "   {Enter}");
    expect(field).toHaveAccessibleDescription("Pick at least one character.");
    expect(calls(fetchMock, "POST /api/config")).toHaveLength(0);
  });

  it("saves the trimmed settings, then replaces this page with home", async () => {
    const pending = deferred();
    const fetchMock = stubFetch({
      "POST /api/llm/validate": reply({ ok: true }),
      "POST /api/config": () => pending.promise,
    });
    const user = userEvent.setup();
    const field = await toPrefixStep(user);
    await user.clear(field);
    await user.type(field, " AI ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    const saves = calls(fetchMock, "POST /api/config");
    expect(saves).toHaveLength(1);
    expect(JSON.parse(String(saves[0][1]?.body))).toEqual({
      spotify_client_id: CLIENT_ID,
      anthropic_api_key: KEY,
      prefix: "AI",
    });

    pending.resolve({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the app refused it",
      reply({ error: {} }, 400),
      "Couldn't save the settings.",
    ],
    [
      "the app was unreachable",
      () => Promise.reject(new TypeError("Failed to fetch")),
      "Couldn't reach the app to save.",
    ],
  ])("says so and lets you save again when %s", async (_, save, message) => {
    const fetchMock = stubFetch({
      "POST /api/llm/validate": reply({ ok: true }),
      "POST /api/config": save as Handler,
    });
    const user = userEvent.setup();
    await toPrefixStep(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(router.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(calls(fetchMock, "POST /api/config")).toHaveLength(2);
  });
});
