// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Whether the chat should warn about an imported conversation's system prompt.
 * An import's prompt is untrusted, so it is flagged when it isn't the user's
 * own. A local conversation is never flagged: its prompt predating an edit is
 * normal. Silent until the user's prompt has loaded, so it can't flash a false
 * difference.
 * @param imported - Whether the conversation came from a file import
 * @param locked - The prompt the conversation runs with (null if none locked)
 * @param current - The prompt the user has set now
 * @param currentReady - Whether the user's prompt has finished loading
 * @returns True when the user should be warned
 */
export function importedPromptDiffers(
  imported: boolean,
  locked: string | null,
  current: string,
  currentReady: boolean,
): boolean {
  return imported && currentReady && locked != null && locked !== current;
}
