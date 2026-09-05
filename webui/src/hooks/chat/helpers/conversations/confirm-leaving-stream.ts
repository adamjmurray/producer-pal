// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Shown before a navigation action cuts a response off mid-turn. */
export const LEAVE_WHILE_STREAMING =
  "This will stop the response in progress. Continue?";

/**
 * Ask before a navigation cuts the streaming turn off. Shared by the sidebar
 * handlers and browser back/forward, which tear the conversation down the same
 * way and so have to ask the same question.
 * @param isAssistantResponding - Whether a response is streaming right now
 * @returns Whether to go ahead with the navigation
 */
export function confirmLeavingStream(isAssistantResponding: boolean): boolean {
  return !isAssistantResponding || confirm(LEAVE_WHILE_STREAMING);
}
