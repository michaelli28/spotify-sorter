import { http, HttpResponse } from "msw";

export const anthropicValidateOk = http.post(
  "https://api.anthropic.com/v1/messages",
  () =>
    HttpResponse.json({
      id: "msg_x",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 1 },
    }),
);

export const anthropicValidateUnauthorized = http.post(
  "https://api.anthropic.com/v1/messages",
  () =>
    HttpResponse.json(
      {
        type: "error",
        error: { type: "authentication_error", message: "invalid key" },
      },
      { status: 401 },
    ),
);
