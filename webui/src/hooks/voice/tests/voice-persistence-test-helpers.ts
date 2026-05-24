// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { act, renderHook } from "@testing-library/preact";
import {
  type UseVoicePersistenceReturn,
  useVoicePersistence,
} from "#webui/hooks/voice/use-voice-persistence";
import {
  type ConversationRecord,
  getConversationDb,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

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

type VoicePersistenceOptions = Omit<
  Parameters<typeof useVoicePersistence>[0],
  "liveHistory"
>;

/**
 * Render useVoicePersistence with a static (empty) live history. Use for tests
 * that load an existing record rather than streaming a live transcript.
 * @param options - onForeignRecord / onLiveRecordDeleted callbacks
 * @returns The renderHook result
 */
export function renderVoicePersistence(
  options: VoicePersistenceOptions = {},
): ReturnType<typeof renderHook<UseVoicePersistenceReturn, unknown>> {
  return renderHook(() => useVoicePersistence({ liveHistory: [], ...options }));
}

export interface VoicePersistenceHistoryView {
  result: ReturnType<
    typeof renderHook<UseVoicePersistenceReturn, { history: RealtimeItem[] }>
  >["result"];
  rerender: (history: RealtimeItem[]) => void;
}

/**
 * Render useVoicePersistence with a mutable live history so a test can simulate
 * incoming transcript turns. `rerender(history)` swaps the live history.
 * @returns The renderHook result plus a history-only rerender shortcut
 */
export function renderVoicePersistenceWithHistory(): VoicePersistenceHistoryView {
  const { result, rerender } = renderHook(
    ({ history }: { history: RealtimeItem[] }) =>
      useVoicePersistence({ liveHistory: history }),
    { initialProps: { history: [] as RealtimeItem[] } },
  );

  return {
    result,
    rerender: (history: RealtimeItem[]) => rerender({ history }),
  };
}

/**
 * Build and persist a voice ConversationRecord. Defaults to an empty message
 * list (voice records carry transcript in voiceHistory, not messages).
 * @param overrides - Fields to override on the record (e.g. voiceHistory)
 * @returns The saved record
 */
export async function saveVoiceRecord(
  overrides: Partial<ConversationRecord> = {},
): Promise<ConversationRecord> {
  const record = createTestRecord({
    sessionType: "voice",
    messages: [],
    ...overrides,
  });

  await saveConversation(record);

  return record;
}
