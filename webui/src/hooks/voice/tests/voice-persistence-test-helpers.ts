// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { act } from "@testing-library/preact";
import { getConversationDb, resetDbCache } from "#webui/lib/conversation-db";

/**
 * Flush pending effects/timers inside act(). Defaults to 30ms; pass ~800ms to
 * let the autosave debounce fire.
 * @param ms - Milliseconds to advance
 */
export async function waitForEffects(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/**
 * Build a user message item with typed text content.
 * @param text - The input text
 * @returns A RealtimeItem
 */
export const userTextItem = (text: string): RealtimeItem =>
  ({
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
  }) as unknown as RealtimeItem;

/**
 * Build a user message item with audio-transcript content.
 * @param transcript - The spoken transcript
 * @returns A RealtimeItem
 */
export const userTranscriptItem = (transcript: string): RealtimeItem =>
  ({
    type: "message",
    role: "user",
    content: [{ type: "input_audio", transcript }],
  }) as unknown as RealtimeItem;

/**
 * Reset the conversation IndexedDB to an empty state between tests.
 */
export async function resetConversationsDb(): Promise<void> {
  await resetDbCache();
  const db = await getConversationDb();

  await db.clear("conversations");
}
