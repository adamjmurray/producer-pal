// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

const CONTEXT_LIMIT_MESSAGE = /context (?:length|size|window)/i;

/**
 * Whether a turn error is the model server refusing input that outgrew its
 * context window. The model's own doing, so a fail, not an infra error. A 400
 * alone isn't enough: servers also answer 400 to a malformed request, and that
 * one is ours.
 *
 * @param error - Turn error, as `describeStreamError` formats it
 * @returns True when the server rejected the input for exceeding the context
 */
export function isContextOverflow(error: string): boolean {
  return error.includes("HTTP 400") && CONTEXT_LIMIT_MESSAGE.test(error);
}
