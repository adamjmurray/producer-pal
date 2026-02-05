// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared utilities for message formatters.
 */
import type { UIMessage } from "#webui/types/messages";

/**
 * Mark the last thought part as open if it exists.
 * Used to show activity indicator on the most recent thinking.
 * @param messages - Messages array to modify
 */
export function markLastThoughtAsOpen(messages: UIMessage[]): void {
  const lastMessage = messages.at(-1);

  if (!lastMessage) return;
  const lastPart = lastMessage.parts.at(-1);

  if (lastPart?.type === "thought") {
    lastPart.isOpen = true;
  }
}
