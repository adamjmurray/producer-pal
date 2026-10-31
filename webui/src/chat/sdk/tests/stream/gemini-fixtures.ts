// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Gemini `streamGenerateContent?alt=sse` chunks, built by hand from the API's
 * documented shape (and the fields `@ai-sdk/google` validates), not recorded.
 * Re-record with `scripts/probes/record-provider-streams.ts`.
 */
import { LIVE_SET_TOOL } from "./fake-mcp-tools";
import { type RawEvent } from "./raw-stream-harness";

export const GEMINI_3 = "gemini-3-flash-preview";
export const GEMINI_25 = "gemini-2.5-flash";

/** The opaque signature Gemini puts on the first part after its thinking. */
export const SIGNATURE = "c2lnLXRva2Vu";

const meta = { modelVersion: GEMINI_3, responseId: "resp-1" };

const usage = (
  candidates: number,
  thoughts: number,
): Record<string, unknown> => ({
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: candidates,
    thoughtsTokenCount: thoughts,
    totalTokenCount: 100 + candidates + thoughts,
  },
});

/**
 * One chunk with a single candidate.
 * @param parts - Content parts
 * @param extra - Candidate fields such as `finishReason`
 * @param usageMetadata - Usage to attach (final chunk)
 * @returns A raw chunk
 */
export function chunk(
  parts: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
  usageMetadata: Record<string, unknown> | null = null,
): RawEvent {
  return {
    candidates: [{ content: { role: "model", parts }, index: 0, ...extra }],
    ...usageMetadata,
    ...meta,
  };
}

/** Thought summaries, then signed text, then STOP with usage. */
export const THINKING_THEN_TEXT: RawEvent[] = [
  chunk([{ text: "**Reading the set**\n\nChecking ", thought: true }]),
  chunk([{ text: "the tempo.", thought: true }]),
  chunk([{ text: "The set runs at ", thoughtSignature: SIGNATURE }]),
  chunk([{ text: "120 BPM." }], { finishReason: "STOP" }, usage(8, 42)),
];

/** A thought summary and a signed function call, as one tool step. */
export const THINKING_THEN_CALL: RawEvent[] = [
  chunk([{ text: "Need the tracks.", thought: true }]),
  chunk(
    [
      {
        functionCall: { name: LIVE_SET_TOOL, args: { include: "t" } },
        thoughtSignature: SIGNATURE,
      },
    ],
    { finishReason: "STOP" },
    usage(5, 20),
  ),
];

/** A signed thought summary, then the answer. */
export const SIGNED_THOUGHT: RawEvent[] = [
  chunk([{ text: "Checking.", thought: true, thoughtSignature: SIGNATURE }]),
  chunk([{ text: "120 BPM." }], { finishReason: "STOP" }, usage(3, 9)),
];

/** The answer once the tool result is in. */
export const ANSWER_AFTER_TOOL: RawEvent[] = [
  chunk([{ text: "Tempo is 120." }], { finishReason: "STOP" }, usage(4, 0)),
];

const call = (
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> => ({
  functionCall: { name, args },
});

/** Two calls in one chunk; only the first carries a signature. */
export const PARALLEL_CALLS: RawEvent[] = [
  chunk(
    [
      {
        ...call(LIVE_SET_TOOL, { include: "a" }),
        thoughtSignature: SIGNATURE,
      },
      call(LIVE_SET_TOOL, { include: "b" }),
    ],
    { finishReason: "STOP" },
    usage(6, 0),
  ),
];

/** A call to a tool that fails. */
export const FAILING_CALL: RawEvent[] = [
  chunk([call("ppal-update-clip", { id: "7" })], { finishReason: "STOP" }),
];

/** A call with no arguments at all. */
export const NO_ARGS_CALL: RawEvent[] = [
  chunk([{ functionCall: { name: LIVE_SET_TOOL } }], {
    finishReason: "STOP",
  }),
];

/** Text cut off by the output limit. */
export const CUT_OFF: RawEvent[] = [
  chunk([{ text: "Tracks: Drums, Ba" }]),
  chunk([{ text: "" }], { finishReason: "MAX_TOKENS" }, usage(16, 0)),
];

/** An empty signature-only text part after the answer, as Gemini 3 sends. */
export const TRAILING_SIGNATURE: RawEvent[] = [
  chunk([{ text: "All set." }]),
  chunk([{ text: "", thoughtSignature: SIGNATURE }], { finishReason: "STOP" }),
];

/** The prompt was blocked: no candidates, only feedback. */
export const BLOCKED: RawEvent[] = [
  { promptFeedback: { blockReason: "SAFETY" }, ...meta },
];

/** The answer is stopped by the safety filter before any text. */
export const SAFETY_STOP: RawEvent[] = [
  chunk([], { finishReason: "SAFETY" }, usage(0, 0)),
];

/** Some text, then the server reports an error inside the stream. */
export const ERROR_MID_STREAM: RawEvent[] = [
  chunk([{ text: "The set has " }]),
  {
    error: {
      code: 503,
      message: "The model is overloaded.",
      status: "UNAVAILABLE",
    },
  },
];

/** The body of an HTTP 429 from the API. */
export const RATE_LIMITED = {
  error: {
    code: 429,
    message: "Quota exceeded for this model.",
    status: "RESOURCE_EXHAUSTED",
  },
};
