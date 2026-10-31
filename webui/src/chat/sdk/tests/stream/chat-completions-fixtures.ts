// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Chat Completions `chat.completion.chunk` streams, built by hand from the
 * documented shape, not recorded. This is what Ollama, LM Studio and custom
 * OpenAI-compatible servers send. Re-record with
 * `scripts/probes/record-provider-streams.ts`.
 */
import { LIVE_SET_TOOL } from "./fake-mcp-tools";
import { type RawEvent } from "./raw-stream-harness";

export const LOCAL_MODEL = "qwen3.8-local";

type Delta = Record<string, unknown>;

/**
 * One chunk.
 * @param delta - The choice's delta
 * @param finishReason - `finish_reason`, on the last content chunk
 * @returns A raw chunk
 */
export function chunk(
  delta: Delta,
  finishReason: string | null = null,
): RawEvent {
  return {
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: LOCAL_MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

/** The trailing usage chunk (no choices) sent when usage is requested. */
export const USAGE: RawEvent = {
  id: "chatcmpl-1",
  object: "chat.completion.chunk",
  created: 1_700_000_000,
  model: LOCAL_MODEL,
  choices: [],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    completion_tokens_details: { reasoning_tokens: 42 },
  },
};

const start = chunk({ role: "assistant", content: "" });
const TOOL_CALLS = "tool_calls";

const call = (
  index: number,
  id: string,
  name: string,
  args: string,
): Delta => ({
  tool_calls: [
    { index, id, type: "function", function: { name, arguments: args } },
  ],
});

const argPiece = (index: number, args: string): Delta => ({
  tool_calls: [{ index, function: { arguments: args } }],
});

/**
 * A reasoning model's answer, with its thinking in the given delta field.
 * @param field - `reasoning_content` or `reasoning`
 * @returns The stream
 */
export function thinkingThenText(field: string): RawEvent[] {
  return [
    start,
    chunk({ [field]: "Checking " }),
    chunk({ [field]: "the tempo." }),
    chunk({ content: "The set runs at " }),
    chunk({ content: "120 BPM." }, "stop"),
    USAGE,
    "[DONE]",
  ];
}

/** A tool call whose arguments stream in pieces. */
export const CALL: RawEvent[] = [
  start,
  chunk(call(0, "call_1", LIVE_SET_TOOL, "")),
  chunk(argPiece(0, '{"incl')),
  chunk(argPiece(0, 'ude":"t"}'), TOOL_CALLS),
  USAGE,
  "[DONE]",
];

/** The same call after some thinking. */
export const THINKING_THEN_CALL: RawEvent[] = [
  start,
  chunk({ reasoning_content: "Need the tracks." }),
  ...CALL.slice(1),
];

/** The answer once the tool result is in. */
export const ANSWER_AFTER_TOOL: RawEvent[] = [
  start,
  chunk({ content: "Tempo is 120." }, "stop"),
  USAGE,
  "[DONE]",
];

/** Two calls in one response. */
export const PARALLEL_CALLS: RawEvent[] = [
  start,
  chunk(call(0, "call_a", LIVE_SET_TOOL, '{"include":"a"}')),
  chunk(call(1, "call_b", LIVE_SET_TOOL, '{"include":"b"}'), "tool_calls"),
  USAGE,
  "[DONE]",
];

/** A call to a tool that fails. */
export const FAILING_CALL: RawEvent[] = [
  start,
  chunk(call(0, "call_x", "ppal-update-clip", '{"id":"7"}'), TOOL_CALLS),
  USAGE,
  "[DONE]",
];

/** Text cut off by the output limit. */
export const CUT_OFF: RawEvent[] = [
  start,
  chunk({ content: "Tracks: Drums, Ba" }, "length"),
  USAGE,
  "[DONE]",
];

/** Some text, then the server reports an error inside the stream. */
export const ERROR_MID_STREAM: RawEvent[] = [
  start,
  chunk({ content: "The set has " }),
  { error: { message: "The model crashed.", type: "server_error" } },
];

/** A server that sends the text and closes without `[DONE]`. */
export const NO_DONE_MARKER: RawEvent[] = [
  start,
  chunk({ content: "120 BPM." }, "stop"),
];

/** The body of an HTTP 429. */
export const RATE_LIMITED = {
  error: { message: "Too many requests.", type: "rate_limit_error" },
};
