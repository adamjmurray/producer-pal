// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Anthropic Messages API stream events, built by hand from the documented event
 * names and the fields `@ai-sdk/anthropic` validates, not recorded. Re-record
 * with `scripts/probes/record-provider-streams.ts`.
 */
import { type RawEvent } from "./raw-stream-harness";

export const CLAUDE = "claude-sonnet-5-5";

export const SIGNATURE = "EuYBCkQYAiJA-sig";
export const REDACTED = "EmwKAhgBEgy3va3pzix-redacted";

const start: RawEvent = {
  type: "message_start",
  message: {
    id: "msg_1",
    model: CLAUDE,
    role: "assistant",
    content: [],
    usage: { input_tokens: 100, output_tokens: 1 },
  },
};

const end = (stopReason: string, output: number, thinking = 0): RawEvent[] => [
  {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: {
      output_tokens: output,
      output_tokens_details: { thinking_tokens: thinking },
    },
  },
  { type: "message_stop" },
];

/**
 * A signed thinking block.
 * @param index - Content block index
 * @param deltas - Thinking text deltas
 * @param signature - Signature sent just before the block closes
 * @returns Events for the block
 */
function thinkingBlock(
  index: number,
  deltas: string[],
  signature: string,
): RawEvent[] {
  return [
    {
      type: "content_block_start",
      index,
      content_block: { type: "thinking", thinking: "", signature: "" },
    },
    ...deltas.map((delta): RawEvent => ({
      type: "content_block_delta",
      index,
      delta: { type: "thinking_delta", thinking: delta },
    })),
    {
      type: "content_block_delta",
      index,
      delta: { type: "signature_delta", signature },
    },
    { type: "content_block_stop", index },
  ];
}

/**
 * A text block.
 * @param index - Content block index
 * @param deltas - Text deltas
 * @returns Events for the block
 */
function textBlock(index: number, deltas: string[]): RawEvent[] {
  return [
    {
      type: "content_block_start",
      index,
      content_block: { type: "text", text: "" },
    },
    ...deltas.map((delta): RawEvent => ({
      type: "content_block_delta",
      index,
      delta: { type: "text_delta", text: delta },
    })),
    { type: "content_block_stop", index },
  ];
}

/**
 * A tool_use block whose input streams in pieces.
 * @param index - Content block index
 * @param id - Tool use id
 * @param name - Tool name
 * @param pieces - Input JSON split into deltas
 * @returns Events for the block
 */
function toolUse(
  index: number,
  id: string,
  name: string,
  pieces: string[],
): RawEvent[] {
  return [
    {
      type: "content_block_start",
      index,
      content_block: { type: "tool_use", id, name, input: {} },
    },
    ...pieces.map((partial_json): RawEvent => ({
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json },
    })),
    { type: "content_block_stop", index },
  ];
}

/** Signed thinking, then the answer. */
export const THINKING_THEN_TEXT: RawEvent[] = [
  start,
  ...thinkingBlock(0, ["Checking ", "the tempo."], SIGNATURE),
  ...textBlock(1, ["The set runs at ", "120 BPM."]),
  ...end("end_turn", 20, 12),
];

/** Two signed thinking blocks in one message, then the answer. */
export const TWO_THINKING_BLOCKS: RawEvent[] = [
  start,
  ...thinkingBlock(0, ["Checking the tempo."], SIGNATURE),
  ...thinkingBlock(1, ["Writing it up."], `${SIGNATURE}2`),
  ...textBlock(2, ["120 BPM."]),
  ...end("end_turn", 20),
];

/** Only a redacted thinking block, then the answer. */
export const REDACTED_THEN_TEXT: RawEvent[] = [
  start,
  {
    type: "content_block_start",
    index: 0,
    content_block: { type: "redacted_thinking", data: REDACTED },
  },
  { type: "content_block_stop", index: 0 },
  ...textBlock(1, ["120 BPM."]),
  ...end("end_turn", 10),
];

/** Signed thinking, then a tool call whose input streams in pieces. */
export const THINKING_THEN_CALL: RawEvent[] = [
  start,
  ...thinkingBlock(0, ["Need the tracks."], SIGNATURE),
  ...toolUse(1, "toolu_1", "ppal-read-live-set", ["", '{"incl', 'ude":"t"}']),
  ...end("tool_use", 25, 12),
];

/** A call to a tool that fails. */
export const FAILING_CALL: RawEvent[] = [
  start,
  ...toolUse(0, "toolu_x", "ppal-update-clip", ["", '{"id":"7"}']),
  ...end("tool_use", 25),
];

/** The answer once the tool result is in. */
export const ANSWER_AFTER_TOOL: RawEvent[] = [
  start,
  ...textBlock(0, ["Tempo is 120."]),
  ...end("end_turn", 8),
];

/** Some text, then the server reports an overload. */
export const OVERLOADED_MID_STREAM: RawEvent[] = [
  start,
  ...textBlock(0, ["The set has "]).slice(0, 2),
  { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
];

/** The body of an HTTP 429. */
export const RATE_LIMITED = {
  type: "error",
  error: { type: "rate_limit_error", message: "Number of requests exceeded." },
};
