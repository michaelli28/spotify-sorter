import { HttpResponse } from "msw";

interface AnthropicMessageMock {
  id?: string;
  model?: string;
  text: string;
  input_tokens: number;
  output_tokens: number;
  stop_reason?: "end_turn" | "max_tokens";
}

export function anthropicSseResponse(m: AnthropicMessageMock): Response {
  const id = m.id ?? "msg_test";
  const model = m.model ?? "claude-haiku-4-5-20251001";
  const stopReason = m.stop_reason ?? "end_turn";

  const events: Array<{ event: string; data: unknown }> = [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id,
          type: "message",
          role: "assistant",
          model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: m.input_tokens, output_tokens: 0 },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: m.text },
      },
    },
    {
      event: "content_block_stop",
      data: { type: "content_block_stop", index: 0 },
    },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: m.output_tokens },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ];

  const body = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join("");

  return new HttpResponse(body, {
    headers: { "content-type": "text/event-stream" },
  });
}
