// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * OpenAI Responses API stream events. Checked against recordings of gpt-6-luna
 * (2026-11): reasoning summaries, a streamed text answer and a function call,
 * with the `in_progress`, `content_part` and `.done` events the real stream
 * sends, and the `response.incomplete` cut-off. The filtered and error streams
 * are built by hand from the documented shapes. Re-record with `scripts/probes/record-provider-streams.ts`.
 */
import { LIVE_SET_TOOL } from "./fake-mcp-tools";
import { type RawEvent } from "./raw-stream-harness";

export const GPT = "gpt-6.1-terra";

/** An opaque `encrypted_content` blob, as returned when `store` is off. */
export const ENCRYPTED = "gAAAAABlZW5jcnlwdGVk";

const ITEM_ADDED = "response.output_item.added";
const ITEM_DONE = "response.output_item.done";

let seq = 0;

const ev = (type: string, fields: Record<string, unknown>): RawEvent => ({
  type,
  sequence_number: seq++,
  ...fields,
});

const response = { id: "resp_1", created_at: 1_700_000_000, model: GPT };

const created: RawEvent[] = [
  ev("response.created", { response }),
  ev("response.in_progress", { response }),
];

const completed = (
  output: number,
  reasoning: number,
  details: Record<string, unknown> | null = null,
): RawEvent =>
  ev(details == null ? "response.completed" : "response.incomplete", {
    response: {
      ...(details == null ? {} : { incomplete_details: details }),
      usage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 60 },
        output_tokens: output + reasoning,
        output_tokens_details: { reasoning_tokens: reasoning },
      },
    },
  });

/**
 * A reasoning item that streams the given summary parts.
 * @param id - Item id
 * @param index - Output index
 * @param summaries - One entry per summary part, each a list of deltas
 * @param encrypted - `encrypted_content` on the item, if any
 * @returns Events from item start to item done
 */
export function reasoningItem(
  id: string,
  index: number,
  summaries: string[][],
  encrypted: string | null = null,
): RawEvent[] {
  return [
    ev(ITEM_ADDED, {
      output_index: index,
      item: { type: "reasoning", id, encrypted_content: null },
    }),
    ...summaries.flatMap((deltas, i) => [
      ev("response.reasoning_summary_part.added", {
        item_id: id,
        output_index: index,
        summary_index: i,
        part: { type: "summary_text", text: "" },
      }),
      ...deltas.map((delta) =>
        ev("response.reasoning_summary_text.delta", {
          item_id: id,
          output_index: index,
          summary_index: i,
          delta,
        }),
      ),
      ev("response.reasoning_summary_text.done", {
        item_id: id,
        output_index: index,
        summary_index: i,
        text: deltas.join(""),
      }),
      ev("response.reasoning_summary_part.done", {
        item_id: id,
        output_index: index,
        summary_index: i,
        part: { type: "summary_text", text: deltas.join("") },
      }),
    ]),
    ev(ITEM_DONE, {
      output_index: index,
      item: { type: "reasoning", id, encrypted_content: encrypted },
    }),
  ];
}

/**
 * An assistant message item that streams the given text deltas.
 * @param id - Item id
 * @param index - Output index
 * @param deltas - Text deltas in order
 * @returns Events from item start to item done
 */
export function messageItem(
  id: string,
  index: number,
  deltas: string[],
): RawEvent[] {
  const text = deltas.join("");
  const part = { type: "output_text", annotations: [], text: "" };
  const item = {
    type: "message",
    id,
    phase: "final_answer",
    role: "assistant",
  };

  return [
    ev(ITEM_ADDED, {
      output_index: index,
      item: { ...item, status: "in_progress", content: [] },
    }),
    ev("response.content_part.added", {
      item_id: id,
      output_index: index,
      content_index: 0,
      part,
    }),
    ...deltas.map((delta) =>
      ev("response.output_text.delta", {
        item_id: id,
        output_index: index,
        content_index: 0,
        delta,
      }),
    ),
    ev("response.output_text.done", {
      item_id: id,
      output_index: index,
      content_index: 0,
      text,
    }),
    ev("response.content_part.done", {
      item_id: id,
      output_index: index,
      content_index: 0,
      part: { ...part, text },
    }),
    ev(ITEM_DONE, {
      output_index: index,
      item: {
        ...item,
        status: "completed",
        content: [{ ...part, text }],
      },
    }),
  ];
}

/**
 * A function call item whose arguments stream in pieces.
 * @param id - Item id
 * @param callId - The call id the result must echo
 * @param name - Tool name
 * @param index - Output index
 * @param pieces - Argument JSON split into deltas
 * @returns Events from item start to item done
 */
export function callItem(
  id: string,
  callId: string,
  name: string,
  index: number,
  pieces: string[],
): RawEvent[] {
  const args = pieces.join("");
  const item = { type: "function_call", id, call_id: callId, name };

  return [
    ev(ITEM_ADDED, {
      output_index: index,
      item: { ...item, arguments: "", status: "in_progress" },
    }),
    ...pieces.map((delta) =>
      ev("response.function_call_arguments.delta", {
        item_id: id,
        output_index: index,
        delta,
      }),
    ),
    ev("response.function_call_arguments.done", {
      item_id: id,
      output_index: index,
      arguments: args,
    }),
    ev(ITEM_DONE, {
      output_index: index,
      item: { ...item, arguments: args, status: "completed" },
    }),
  ];
}

/** Summarized reasoning, then the answer. */
export const THINKING_THEN_TEXT: RawEvent[] = [
  ...created,
  ...reasoningItem("rs_1", 0, [
    ["**Reading the set**\n\n", "Checking the tempo."],
  ]),
  ...messageItem("msg_1", 1, ["The set runs at ", "120 BPM."]),
  completed(8, 42),
];

/** Reasoning in two summary parts, then the answer. */
export const TWO_SUMMARY_PARTS: RawEvent[] = [
  ...created,
  ...reasoningItem("rs_1", 0, [
    ["**Reading the set**\n\nChecking the tempo."],
    ["**Writing it up**\n\nKeeping it short."],
  ]),
  ...messageItem("msg_1", 1, ["120 BPM."]),
  completed(4, 30),
];

/** Reasoning that arrives encrypted, with no summary text. */
export const ENCRYPTED_REASONING: RawEvent[] = [
  ...created,
  ...reasoningItem("rs_1", 0, [], ENCRYPTED),
  ...messageItem("msg_1", 1, ["120 BPM."]),
  completed(4, 30),
];

/** Reasoning, then a tool call whose arguments stream in pieces. */
export const THINKING_THEN_CALL: RawEvent[] = [
  ...created,
  ...reasoningItem("rs_2", 0, [["Need the tracks."]]),
  ...callItem("fc_1", "call_1", LIVE_SET_TOOL, 1, ['{"incl', 'ude":"t"}']),
  completed(5, 20),
];

/** The answer once the tool result is in. */
export const ANSWER_AFTER_TOOL: RawEvent[] = [
  ...created,
  ...messageItem("msg_3", 0, ["Tempo is 120."]),
  completed(4, 0),
];

/** Two calls in one response. */
export const PARALLEL_CALLS: RawEvent[] = [
  ...created,
  ...callItem("fc_a", "call_a", LIVE_SET_TOOL, 0, ['{"include":"a"}']),
  ...callItem("fc_b", "call_b", LIVE_SET_TOOL, 1, ['{"include":"b"}']),
  completed(6, 0),
];

/** A call to a tool that fails. */
export const FAILING_CALL: RawEvent[] = [
  ...created,
  ...callItem("fc_x", "call_x", "ppal-update-clip", 0, ['{"id":"7"}']),
  completed(3, 0),
];

/** A call with an empty argument string. */
export const NO_ARGS_CALL: RawEvent[] = [
  ...created,
  ...callItem("fc_n", "call_n", LIVE_SET_TOOL, 0, []),
  completed(3, 0),
];

/** Text cut off by the output limit. */
export const CUT_OFF: RawEvent[] = [
  ...created,
  ...messageItem("msg_1", 0, ["Tracks: Drums, Ba"]),
  completed(16, 0, { reason: "max_output_tokens" }),
];

/** The content filter ends the response with no output. */
export const FILTERED: RawEvent[] = [
  ...created,
  completed(0, 0, { reason: "content_filter" }),
];

/** Some text, then the response fails. */
export const FAILED_MID_STREAM: RawEvent[] = [
  ...created,
  ...messageItem("msg_1", 0, ["The set has "]).slice(0, 3),
  ev("response.failed", {
    response: {
      error: { code: "server_error", message: "The server had an error." },
    },
  }),
];

/** Some text, then a bare `error` event. */
export const ERROR_EVENT: RawEvent[] = [
  ...created,
  ...messageItem("msg_1", 0, ["The set has "]).slice(0, 3),
  ev("error", {
    code: "rate_limit_exceeded",
    message: "Rate limit reached for this model.",
  }),
];

/** The body of an HTTP 429 from the API. */
export const RATE_LIMITED = {
  error: {
    message: "Rate limit reached for requests.",
    type: "requests",
    code: "rate_limit_exceeded",
  },
};
