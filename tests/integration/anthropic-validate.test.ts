// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { validateAnthropicKey } from "@/src/lib/llm/client";
import {
  anthropicValidateOk,
  anthropicValidateUnauthorized,
} from "../fixtures/anthropic-handlers";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("validateAnthropicKey", () => {
  it("returns ok for a valid key", async () => {
    server.use(anthropicValidateOk);
    const result = await validateAnthropicKey("sk-ant-x");
    expect(result).toEqual({ ok: true });
  });

  it("returns error for 401", async () => {
    server.use(anthropicValidateUnauthorized);
    const result = await validateAnthropicKey("sk-ant-bad");
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toMatch(/invalid|authentication/i);
  });
});
