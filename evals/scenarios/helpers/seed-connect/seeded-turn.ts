// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The message shape of a turn written straight into conversation history,
 * without asking the model for any of it. See `seed-connect.ts` for the one
 * caller and why it exists.
 */

import { type JSONValue, type ModelMessage } from "ai";

/**
 * Google's documented stand-in for a thought signature on a tool call the model
 * did not actually make.
 *
 * @see https://ai.google.dev/gemini-api/docs/thought-signatures
 */
const SKIP_THOUGHT_SIGNATURE_VALIDATOR = "skip_thought_signature_validator";

/**
 * A complete conversation turn to write into history: the user's message, one
 * tool call the assistant is credited with, that call's result, and the
 * assistant's closing text.
 */
export interface SeededTurn {
  /** The user message that opens the turn */
  userMessage: string;
  /** Name of the tool the assistant "called" */
  toolName: string;
  /** Arguments of that call */
  toolArgs: Record<string, unknown>;
  /** The call's output exactly as the model would have received it: the raw
   *  MCP content array, which is what the AI SDK tool wrapper in `mcp.ts`
   *  returns from `execute`. NOT the unwrapped first text block —
   *  `ppal-connect` answers in several blocks and the skills live in the
   *  second, so anything narrower silently strips them out of context. */
  toolOutput: JSONValue;
  /** The assistant's closing text for the turn */
  assistantText: string;
}

/**
 * Build the four messages a seeded turn adds to history.
 *
 * @param turn - The turn to write
 * @param toolCallId - Id linking the tool call to its result
 * @returns Messages to append, in order
 */
export function buildSeededMessages(
  turn: SeededTurn,
  toolCallId: string,
): ModelMessage[] {
  return [
    { role: "user", content: turn.userMessage },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId,
          toolName: turn.toolName,
          input: turn.toolArgs,
          providerOptions: {
            // Gemini 3 rejects a replayed tool call that carries no thought
            // signature. There is none to carry — the model never made this
            // call — so declare the documented opt-out. Without it the SDK
            // injects the same sentinel and warns that we dropped a signature
            // somewhere, sending the next reader after a bug that isn't there.
            // Other providers ignore a `google` namespace they don't own.
            google: { thoughtSignature: SKIP_THOUGHT_SIGNATURE_VALIDATOR },
          },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId,
          toolName: turn.toolName,
          // `{type:"json"}` is what the SDK itself produces for a tool whose
          // execute returned a non-string (see createToolModelOutput), so a
          // seeded result serializes to the provider exactly like a real one.
          output: { type: "json", value: turn.toolOutput },
        },
      ],
    },
    // Closing text matters beyond realism: without it the tool result is the
    // last thing in history, and the next user message would follow a tool role
    // directly — a shape some providers reject.
    {
      role: "assistant",
      content: [{ type: "text", text: turn.assistantText }],
    },
  ];
}
