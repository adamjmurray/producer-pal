// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { generateText, type LanguageModel } from "ai";
import { type ChatMessage } from "./types";

/**
 * System prompt for conversation compaction. Tuned for Producer Pal: preserve
 * musical intent and decisions over raw tool-result data (live state can be
 * re-read with tools), and keep concrete notation examples as written so a
 * small model keeps using the same dialect after compaction.
 */
export const COMPACTION_PROMPT = `You are compacting a conversation between a user and an AI music-composition assistant for Ableton Live, so it can continue under a smaller context window.

Write a dense summary that lets the assistant pick up exactly where it left off. Preserve:
- The user's musical goals and aesthetic direction.
- Concrete decisions: key, scale, tempo, time signature, track and clip names, arrangement structure.
- What has been built so far, and what is still pending or requested.
- Concrete examples of any notation or syntax the assistant used (e.g. bar|beat note strings), exactly as written — these teach the assistant the dialect to keep using.

The current Live Set state can always be re-read with the tools, so capture intent and decisions rather than copying large tool-result dumps. Write the summary as notes to your future self, not as a message to the user. Do not add any commentary before or after the summary.`;

const SUMMARIZE_INSTRUCTION =
  "Summarize the conversation transcript above following your instructions.";

/**
 * Summarize a slice of chat history into a single compaction summary string,
 * using the conversation's own model with no tools. The slice is rendered to a
 * plain-text transcript rather than replayed as structured turns, which
 * sidesteps provider role-ordering rules for arbitrary slices (e.g. one ending
 * on a tool result).
 * @param model - The conversation's language model
 * @param history - Chat messages to compact (oldest first)
 * @returns The compaction summary text
 */
export async function summarizeHistory(
  model: LanguageModel,
  history: ChatMessage[],
): Promise<string> {
  const transcript = renderTranscript(history);
  const { text } = await generateText({
    model,
    instructions: COMPACTION_PROMPT,
    messages: [
      { role: "user", content: `${transcript}\n\n${SUMMARIZE_INSTRUCTION}` },
    ],
  });

  return text.trim();
}

/**
 * Render chat history to a plain-text transcript for summarization, including
 * tool calls and results so the summary reflects what the assistant actually
 * did.
 * @param history - Chat messages to render (oldest first)
 * @returns Plain-text transcript
 */
export function renderTranscript(history: ChatMessage[]): string {
  const lines: string[] = [];

  for (const msg of history) {
    if (msg.isError) continue;

    if (msg.role === "user") {
      lines.push(`USER: ${msg.content}`);
      continue;
    }

    if (msg.content) {
      lines.push(`ASSISTANT: ${msg.content}`);
    }

    for (const call of msg.toolCalls ?? []) {
      lines.push(`ASSISTANT called ${call.name}(${JSON.stringify(call.args)})`);
    }

    for (const result of msg.toolResults ?? []) {
      const value =
        typeof result.result === "string"
          ? result.result
          : JSON.stringify(result.result);

      lines.push(`TOOL ${result.name} => ${value}`);
    }
  }

  return lines.join("\n");
}
