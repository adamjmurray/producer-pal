// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type FinishReason } from "ai";

const CONTENT_FILTER_NOTICE =
  "The provider stopped this reply because of its content filter. Try rephrasing your message.";

const EMPTY_REPLY_NOTICE =
  "The provider ended this reply without any content. Try sending your message again.";

/** Every notice {@link streamEndNotice} can return. */
export const STREAM_END_NOTICES: readonly string[] = [
  CONTENT_FILTER_NOTICE,
  EMPTY_REPLY_NOTICE,
];

/**
 * The notice a turn needs when the provider ended it and the chat would
 * otherwise show nothing (or no reason for a cut-off).
 *
 * A content filter always gets one, since it can cut a reply short. `other` and
 * `error` only get one when the turn produced nothing.
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

  if (
    (finishReason === "other" || finishReason === "error") &&
    !producedContent
  ) {
    return EMPTY_REPLY_NOTICE;
  }

  return undefined;
}
