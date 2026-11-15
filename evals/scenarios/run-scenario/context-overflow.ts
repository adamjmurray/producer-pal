// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

const CONTEXT_LIMIT_MESSAGE = /context (?:length|size|window)/i;
const OTHER_STATUS = /HTTP (?!400\b)\d/;

/**
 * Whether a turn error is the model server refusing input that outgrew its
 * context window. The model's own doing, so a fail, not an infra error.
 *
 * The message must name the context limit: a 400 alone also covers a malformed
 * request, and that one is ours. Ollama answers 400; LM Studio reports it
 * inside the stream with no status. Any other status stays an infra error.
 *
 * @param error - Turn error, as `describeStreamError` formats it
 * @returns True when the server rejected the input for exceeding the context
 */
export function isContextOverflow(error: string): boolean {
  return CONTEXT_LIMIT_MESSAGE.test(error) && !OTHER_STATUS.test(error);
}
