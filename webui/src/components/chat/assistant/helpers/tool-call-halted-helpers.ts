// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  CANCELED_TOOL_RESULT_TEXT,
  FAILED_TOOL_RESULT_TEXT,
} from "#webui/chat/sdk/build-model-messages";

/**
 * Read a halted run's status off the synthetic result a reconcile left behind:
 * the user stopping the turn and the turn dying under the call both cut it
 * short, and they say different things. A real result returns null.
 * @param result - The formatted tool result, or null while the call is running
 * @returns Status label, or null for a running call or a real result
 */
export function haltedToolStatus(result: string | null): string | null {
  if (result == null) return null;

  const text = unwrapToolResultText(result);

  if (text === CANCELED_TOOL_RESULT_TEXT) return "stopped";

  if (text === FAILED_TOOL_RESULT_TEXT) return "interrupted";

  return null;
}

/**
 * Unwrap a tool result for display. The formatter JSON-stringifies every result,
 * so a plain-string one arrives quoted (`"\"Done.\""`); parse those back to the
 * bare text. Anything that isn't a JSON string is returned verbatim.
 * @param result - The formatted tool result
 * @returns The display text
 */
export function unwrapToolResultText(result: string): string {
  try {
    const parsed: unknown = JSON.parse(result);

    return typeof parsed === "string" ? parsed : result;
  } catch {
    return result;
  }
}
