// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { CANCELED_TOOL_RESULT_TEXT } from "#webui/chat/sdk/build-model-messages";
import { type UIMessage, type UIPart } from "#webui/types/messages";

/**
 * Give every tool call still waiting on a result the same canceled placeholder
 * the stream writes into history as it unwinds, so the cards stop reading as
 * "working…" the moment the user presses Stop.
 *
 * The stream's own reconcile can't do this: it lands after the abort, and by
 * then onMessageUpdate drops its repaint — which it has to, because a
 * conversation switch aborts the same way and a late paint would clobber the
 * conversation the user switched to.
 *
 * Returns the array unchanged when nothing was running, so a Stop with no tool
 * in flight doesn't re-render.
 * @param messages - The rendered transcript
 * @returns The transcript with running tool calls marked as stopped
 */
export function haltRunningToolCalls(messages: UIMessage[]): UIMessage[] {
  if (!messages.some(hasRunningToolCall)) return messages;

  return messages.map((message) =>
    hasRunningToolCall(message)
      ? { ...message, parts: message.parts.map(haltPart) }
      : message,
  );
}

/**
 * Whether a message holds a tool call that never got a result.
 * @param message - The message to check
 * @returns True when at least one of its tool parts is still running
 */
function hasRunningToolCall(message: UIMessage): boolean {
  return message.parts.some(
    (part) => part.type === "tool" && part.result == null,
  );
}

/**
 * Stamp the canceled placeholder on a running tool part, leaving every other
 * part alone. Stringified because the formatter JSON-encodes every result, and
 * the card has to read the same either way — live now, or restored later.
 * @param part - The part to consider
 * @returns The part, halted if it was a running tool call
 */
function haltPart(part: UIPart): UIPart {
  if (part.type !== "tool" || part.result != null) return part;

  return { ...part, result: JSON.stringify(CANCELED_TOOL_RESULT_TEXT) };
}
