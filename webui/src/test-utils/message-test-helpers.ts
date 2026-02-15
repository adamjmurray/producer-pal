// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { type UIMessage } from "#webui/types/messages";

/**
 * Strip timestamps from UIMessages for comparison (timestamps are dynamic).
 * @param messages - Messages with timestamps
 * @returns Messages without timestamps for static comparison
 */
export function stripTimestamps(
  messages: UIMessage[],
): Omit<UIMessage, "timestamp">[] {
  return messages.map(({ timestamp: _, ...rest }) => rest);
}

/**
 * Assert that all messages have valid numeric timestamps.
 * @param messages - Messages to validate
 */
export function expectValidTimestamps(messages: UIMessage[]): void {
  expect(messages.every((m) => typeof m.timestamp === "number")).toBe(true);
}
