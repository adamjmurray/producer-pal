// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type FinishReason } from "ai";

// Notice = reason + UI advice. A subagent's orchestrator gets only the reason.
const CONTENT_FILTER_REASON =
  "The provider stopped this reply because of its content filter.";
const CONTENT_FILTER_NOTICE = `${CONTENT_FILTER_REASON} Use Retry, or edit your message and rephrase it.`;

const EMPTY_REPLY_REASON = "The provider ended this reply without any content.";
const EMPTY_REPLY_NOTICE = `${EMPTY_REPLY_REASON} Use Retry, or edit your message.`;

const OUTPUT_LIMIT_REASON = "The reply hit the output limit and was cut off.";
const OUTPUT_LIMIT_NOTICE = `${OUTPUT_LIMIT_REASON} Use Retry, or edit your message to ask for a shorter reply.`;

const REASON_BY_NOTICE: ReadonlyMap<string, string> = new Map([
  [CONTENT_FILTER_NOTICE, CONTENT_FILTER_REASON],
  [EMPTY_REPLY_NOTICE, EMPTY_REPLY_REASON],
  [OUTPUT_LIMIT_NOTICE, OUTPUT_LIMIT_REASON],
]);

/**
 * The model-facing reason behind a notice, without the UI advice.
 * @param content - A chat entry's text
 * @returns The reason if the text is exactly one of the notices, else undefined
 */
export function streamEndReason(content: string): string | undefined {
  return REASON_BY_NOTICE.get(content);
}

/**
 * Whether a notice is for a reply cut short, whose partial text is still worth
 * handing on (unlike a filtered or empty reply).
 * @param content - A chat entry's text
 * @returns True if the text is exactly the output-limit notice
 */
export function streamEndKeepsPartialText(content: string): boolean {
  return content === OUTPUT_LIMIT_NOTICE;
}

/**
 * The notice a turn needs when the provider ended it and the chat would
 * otherwise show nothing (or no reason for a cut-off).
 *
 * A content filter or the output limit (`length`) always gets one, since each
 * can cut a reply short. `other` and `error` only get one when the turn
 * produced nothing. Only the turn's final finish reason counts, so an earlier
 * step that hit the limit before the loop carried on gets none.
 * @param finishReason - The turn's final finish reason, if the stream sent one
 * @param producedContent - Whether the turn added any assistant message
 * @returns The notice text, or undefined when none is needed
 */
export function streamEndNotice(
  finishReason: FinishReason | undefined,
  producedContent: boolean,
): string | undefined {
  if (finishReason === "content-filter") {
    return CONTENT_FILTER_NOTICE;
  }

  if (finishReason === "length") {
    return OUTPUT_LIMIT_NOTICE;
  }

  if (
    (finishReason === "other" || finishReason === "error") &&
    !producedContent
  ) {
    return EMPTY_REPLY_NOTICE;
  }

  return undefined;
}
