// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { act, renderHook } from "@testing-library/preact";
import { expect, vi } from "vitest";
import {
  type UseVoicePersistenceReturn,
  useVoicePersistence,
} from "#webui/hooks/voice/use-voice-persistence";
import {
  type ConversationRecord,
  getConversationDb,
  loadConversation,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

export { fireHashChange } from "#webui/test-utils/dom-test-helpers";

// Shrink the autosave debounce so tests don't sleep out the real 600ms on every
// save. Importers get this for free — vi.mock is hoisted above their imports.
vi.mock("#webui/lib/constants/autosave", () => ({
  VOICE_AUTOSAVE_DEBOUNCE_MS: 1,
  CONTEXT_EDITOR_SAVE_DEBOUNCE_MS: 1,
  DOC_COLLECTION_AUTOSAVE_DEBOUNCE_MS: 1,
}));

/**
 * Flush pending effects/timers inside act().
 * @param ms - Milliseconds to advance
 */
export async function waitForEffects(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/**
 * Flush the debounced autosave and the IDB write it kicks off. The debounce is
 * mocked to ~0, so this only has to outlast the async save itself.
 */
export async function waitForAutosave(): Promise<void> {
  await waitForEffects(50);
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
 * @param options - onForeignRecord / onLiveRecordDeleted callbacks
 * @returns The renderHook result plus a history-only rerender shortcut
 */
export function renderVoicePersistenceWithHistory(
  options: VoicePersistenceOptions = {},
): VoicePersistenceHistoryView {
  const { result, rerender } = renderHook(
    ({ history }: { history: RealtimeItem[] }) =>
      useVoicePersistence({ liveHistory: history, ...options }),
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

/**
 * Persist a text-mode ConversationRecord and render the voice-persistence hook
 * with an `onForeignRecord` spy attached.
 * @param overrides - Fields to override on the persisted record
 * @returns The saved record, the spy, and the rendered hook result
 */
export async function setupForeignTextRecord(
  overrides: Partial<ConversationRecord> = {},
): Promise<{
  textRecord: ConversationRecord;
  onForeignRecord: ReturnType<typeof vi.fn>;
  result: ReturnType<typeof renderVoicePersistence>["result"];
}> {
  const textRecord = createTestRecord({ sessionType: "text", ...overrides });

  await saveConversation(textRecord);

  const onForeignRecord = vi.fn();
  const { result } = renderVoicePersistence({ onForeignRecord });

  await waitForEffects();

  return { textRecord, onForeignRecord, result };
}

/**
 * Continue a previously saved voice record (hash load → Stop → Talk) while
 * current settings point at `model`: adds one more transcript turn, lets the
 * autosave debounce fire, and reads the record back so the caller can check
 * which fields the merge preserved vs re-stamped.
 * @param record - The saved voice record to continue
 * @param model - The realtime model the current settings select
 * @returns The rendered hook result and the reloaded record
 */
export async function continueSavedVoiceSession(
  record: ConversationRecord,
  model: string,
): Promise<{
  result: VoicePersistenceHistoryView["result"];
  loaded: ConversationRecord | undefined;
}> {
  window.location.hash = record.id;

  const { result, rerender } = renderVoicePersistenceWithHistory({ model });

  await waitForEffects();
  rerender([userTextItem("first turn"), userTextItem("second turn")]);
  await waitForAutosave();

  return { result, loaded: await loadConversation(record.id) };
}

/**
 * Run a bulk delete inside the autosave's pre-adoption window: a brand-new
 * session produces transcript, so the autosave reserves an id but hasn't
 * resolved yet and no active id has been adopted (asserted here as the
 * scenario's precondition). The bulk delete lands in that window without
 * stopping the session, so the reserved-id autosave is still scheduled — then
 * the debounce is allowed to fire so the caller can check it bailed.
 * @param bulkDelete - The bulk delete to invoke during the window
 * @returns The rendered hook result
 */
export async function bulkDeleteDuringPendingNewSave(
  bulkDelete: (hook: UseVoicePersistenceReturn) => Promise<void>,
): Promise<VoicePersistenceHistoryView["result"]> {
  const { result, rerender } = renderVoicePersistenceWithHistory();

  await waitForEffects();
  rerender([userTextItem("brand new")]);
  expect(result.current.activeConversationId).toBeNull();

  await act(() => bulkDelete(result.current));
  await waitForAutosave();

  return result;
}

/**
 * Save a voice record, point the URL hash at it, render the hook with an
 * `onLiveRecordDeleted` spy, and wait for the initial effects to settle.
 * @param overrides - Fields to override on the saved record
 * @returns The saved record, the spy, and the rendered hook result
 */
export async function setupLiveRecordWithDeletionSpy(
  overrides: Partial<ConversationRecord> = {},
): Promise<{
  record: ConversationRecord;
  onLiveRecordDeleted: ReturnType<typeof vi.fn>;
  result: ReturnType<typeof renderVoicePersistence>["result"];
}> {
  const record = await saveVoiceRecord({
    voiceHistory: [userTextItem("live")],
    ...overrides,
  });

  window.location.hash = record.id;
  const onLiveRecordDeleted = vi.fn();
  const { result } = renderVoicePersistence({ onLiveRecordDeleted });

  await waitForEffects();

  return { record, onLiveRecordDeleted, result };
}
