// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { type RealtimeItem } from "@openai/agents/realtime";
import { act, renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVoicePersistence } from "#webui/hooks/voice/use-voice-persistence";
import { loadConversation, saveConversation } from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import {
  resetConversationsDb,
  userTextItem,
  userTranscriptItem,
  waitForEffects,
} from "./voice-persistence-test-helpers";

const originalLocation = window.location;

beforeEach(async () => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  window.location.hash = "";
  await resetConversationsDb();
});

describe("useVoicePersistence", () => {
  it("initializes with an empty list and no active conversation", async () => {
    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();

    expect(result.current.conversations).toStrictEqual([]);
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.savedItems).toStrictEqual([]);
  });

  it("auto-saves the live transcript with sessionType=voice", async () => {
    const { result, rerender } = renderHook(
      ({ history }: { history: RealtimeItem[] }) =>
        useVoicePersistence({ liveHistory: history }),
      { initialProps: { history: [] as RealtimeItem[] } },
    );

    await waitForEffects();
    rerender({ history: [userTextItem("hi pal")] });
    await waitForEffects(800);

    expect(result.current.activeConversationId).not.toBeNull();

    const loaded = await loadConversation(
      result.current.activeConversationId as string,
    );

    expect(loaded?.sessionType).toBe("voice");
    expect(loaded?.title).toBe("hi pal");
    expect(loaded?.voiceHistory ?? []).toHaveLength(1);
  });

  it("reuses one reserved id across rapid updates, creating a single record", async () => {
    const { result, rerender } = renderHook(
      ({ history }: { history: RealtimeItem[] }) =>
        useVoicePersistence({ liveHistory: history }),
      { initialProps: { history: [] as RealtimeItem[] } },
    );

    await waitForEffects();
    // Two transcript updates land before any save resolves and adopts an
    // active id. Both autosave effect runs must reuse the same reserved id,
    // otherwise the second mints a fresh UUID and creates a duplicate record.
    rerender({ history: [userTextItem("first")] });
    rerender({ history: [userTextItem("first"), userTextItem("second")] });
    await waitForEffects(800);

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0]?.id).toBe(
      result.current.activeConversationId,
    );
  });

  it("derives a title from the first user transcript", async () => {
    const { result, rerender } = renderHook(
      ({ history }: { history: RealtimeItem[] }) =>
        useVoicePersistence({ liveHistory: history }),
      { initialProps: { history: [] as RealtimeItem[] } },
    );

    await waitForEffects();
    rerender({
      history: [userTranscriptItem("make me a clip")],
    });
    await waitForEffects(800);

    const loaded = await loadConversation(
      result.current.activeConversationId as string,
    );

    expect(loaded?.title).toBe("make me a clip");
  });

  it("clears the active id when the hash points to a missing record", async () => {
    window.location.hash = "missing-id";

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();

    expect(result.current.activeConversationId).toBeNull();
  });

  it("auto-saves with a null title when no user message is present yet", async () => {
    const assistantOnly = {
      type: "message",
      role: "assistant",
      content: [{ type: "output_audio", transcript: "hello" }],
    } as unknown as RealtimeItem;

    const { result, rerender } = renderHook(
      ({ history }: { history: RealtimeItem[] }) =>
        useVoicePersistence({ liveHistory: history }),
      { initialProps: { history: [] as RealtimeItem[] } },
    );

    await waitForEffects();
    rerender({ history: [assistantOnly] });
    await waitForEffects(800);

    const loaded = await loadConversation(
      result.current.activeConversationId as string,
    );

    expect(loaded?.title).toBeNull();
  });

  it("loads a saved voice conversation from the URL hash on mount", async () => {
    const voiceRecord = createTestRecord({
      sessionType: "voice",
      voiceHistory: [userTextItem("from hash")],
      messages: [],
    });

    await saveConversation(voiceRecord);
    window.location.hash = voiceRecord.id;

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();

    expect(result.current.activeConversationId).toBe(voiceRecord.id);
    expect(result.current.savedItems).toHaveLength(1);
  });

  it("invokes onForeignRecord when the hash points to a text conversation", async () => {
    const textRecord = createTestRecord({ sessionType: "text" });

    await saveConversation(textRecord);
    window.location.hash = textRecord.id;

    const onForeignRecord = vi.fn();

    renderHook(() => useVoicePersistence({ liveHistory: [], onForeignRecord }));
    await waitForEffects();

    expect(onForeignRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: textRecord.id }),
    );
  });

  it("clears the hash when a text record is loaded without an onForeignRecord handler", async () => {
    const textRecord = createTestRecord({ sessionType: "text" });

    await saveConversation(textRecord);
    window.location.hash = textRecord.id;

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    expect(result.current.activeConversationId).toBeNull();
  });

  it("startNewConversation clears active id and saved items", async () => {
    const voiceRecord = createTestRecord({
      sessionType: "voice",
      voiceHistory: [userTextItem("saved")],
      messages: [],
    });

    await saveConversation(voiceRecord);
    window.location.hash = voiceRecord.id;

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    expect(result.current.savedItems).toHaveLength(1);

    await act(() => {
      result.current.startNewConversation();
    });

    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.savedItems).toStrictEqual([]);
    expect(window.location.hash).toBe("");
  });

  it("switchConversation loads a voice record's saved items", async () => {
    const voiceRecord = createTestRecord({
      sessionType: "voice",
      voiceHistory: [userTextItem("voice content")],
      messages: [],
    });

    await saveConversation(voiceRecord);

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    await act(() => result.current.switchConversation(voiceRecord.id));

    expect(result.current.activeConversationId).toBe(voiceRecord.id);
    expect(result.current.savedItems).toHaveLength(1);
  });

  it("switchConversation clears active state when the record is missing", async () => {
    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    await act(() => result.current.switchConversation("does-not-exist"));

    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.savedItems).toStrictEqual([]);
  });

  it("switchConversation invokes onForeignRecord for text records", async () => {
    const textRecord = createTestRecord({ sessionType: "text" });

    await saveConversation(textRecord);
    const onForeignRecord = vi.fn();

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [], onForeignRecord }),
    );

    await waitForEffects();

    await act(() => result.current.switchConversation(textRecord.id));

    expect(onForeignRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: textRecord.id }),
    );
  });

  it("switchConversation updates the URL hash before onForeignRecord runs", async () => {
    const textRecord = createTestRecord({ id: "chat-1", sessionType: "text" });

    await saveConversation(textRecord);
    let hashWhenForeignCalled: string | null = null;
    const onForeignRecord = vi.fn(() => {
      hashWhenForeignCalled = window.location.hash;
    });

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [], onForeignRecord }),
    );

    await waitForEffects();

    await act(() => result.current.switchConversation(textRecord.id));

    // The new mode mounts after onForeignRecord settles state, so the hash
    // must point to the foreign id *before* the callback fires.
    expect(hashWhenForeignCalled).toBe("#chat-1");
  });

  it("deletes a conversation and refreshes the list", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      voiceHistory: [],
      messages: [],
    });

    await saveConversation(record);

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    expect(result.current.conversations).toHaveLength(1);

    await act(() => result.current.deleteConversation(record.id));

    expect(result.current.conversations).toHaveLength(0);
  });

  it("does not resurrect a conversation deleted while its autosave is pending", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      voiceHistory: [userTextItem("original")],
      messages: [],
    });

    await saveConversation(record);
    window.location.hash = record.id;

    const { result, rerender } = renderHook(
      ({ history }: { history: RealtimeItem[] }) =>
        useVoicePersistence({ liveHistory: history }),
      { initialProps: { history: [] as RealtimeItem[] } },
    );

    await waitForEffects();
    expect(result.current.activeConversationId).toBe(record.id);

    // A new transcript turn schedules the debounced autosave for record.id...
    rerender({ history: [userTextItem("a new turn")] });
    // ...then the user deletes the active conversation before it fires.
    await act(() => result.current.deleteConversation(record.id));
    // Let the debounce fire; the in-flight save must bail, not re-create it.
    await waitForEffects(800);

    expect(await loadConversation(record.id)).toBeUndefined();
    expect(result.current.conversations).toHaveLength(0);
  });

  it("deleteAllConversations works when no conversation is active", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      voiceHistory: [userTextItem("hi")],
      messages: [],
    });

    await saveConversation(record);

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.conversations).toHaveLength(1);

    await act(() => result.current.deleteAllConversations());

    expect(result.current.conversations).toHaveLength(0);
  });

  it("does not resurrect a pending new conversation deleted via deleteAllConversations", async () => {
    const { result, rerender } = renderHook(
      ({ history }: { history: RealtimeItem[] }) =>
        useVoicePersistence({ liveHistory: history }),
      { initialProps: { history: [] as RealtimeItem[] } },
    );

    await waitForEffects();
    // A brand-new session produces transcript: the autosave reserves an id but
    // hasn't resolved yet, so no active id has been adopted.
    rerender({ history: [userTextItem("brand new")] });
    expect(result.current.activeConversationId).toBeNull();

    // Delete-all lands during that pre-adoption window. It doesn't stop the
    // session, so the reserved-id autosave is still scheduled.
    await act(() => result.current.deleteAllConversations());
    // Let the debounce fire; the reserved-id save must bail, not create a record.
    await waitForEffects(800);

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
  });

  it("does not resurrect a pending new conversation deleted via deleteUnbookmarkedConversations", async () => {
    const { result, rerender } = renderHook(
      ({ history }: { history: RealtimeItem[] }) =>
        useVoicePersistence({ liveHistory: history }),
      { initialProps: { history: [] as RealtimeItem[] } },
    );

    await waitForEffects();
    rerender({ history: [userTextItem("brand new")] });
    expect(result.current.activeConversationId).toBeNull();

    // A pending-new conversation is unbookmarked, so the bulk delete targets it.
    await act(() => result.current.deleteUnbookmarkedConversations());
    await waitForEffects(800);

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
  });

  it("fires onLiveRecordDeleted when deleteAllConversations removes the live record", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      voiceHistory: [userTextItem("live")],
      messages: [],
    });

    await saveConversation(record);
    window.location.hash = record.id;
    const onLiveRecordDeleted = vi.fn();

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [], onLiveRecordDeleted }),
    );

    await waitForEffects();
    await act(() => result.current.deleteAllConversations());

    expect(onLiveRecordDeleted).toHaveBeenCalledOnce();
  });

  it("does not fire onLiveRecordDeleted when deleteAllConversations has no live record", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      voiceHistory: [userTextItem("other")],
      messages: [],
    });

    await saveConversation(record);
    // No hash → no active/pending live record, just a stored conversation.
    const onLiveRecordDeleted = vi.fn();

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [], onLiveRecordDeleted }),
    );

    await waitForEffects();
    await act(() => result.current.deleteAllConversations());

    expect(onLiveRecordDeleted).not.toHaveBeenCalled();
  });

  it("fires onLiveRecordDeleted when deleteUnbookmarked removes an unbookmarked live record", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      bookmarked: false,
      voiceHistory: [userTextItem("live")],
      messages: [],
    });

    await saveConversation(record);
    window.location.hash = record.id;
    const onLiveRecordDeleted = vi.fn();

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [], onLiveRecordDeleted }),
    );

    await waitForEffects();
    await act(() => result.current.deleteUnbookmarkedConversations());

    expect(onLiveRecordDeleted).toHaveBeenCalledOnce();
  });

  it("does not fire onLiveRecordDeleted when the live record is bookmarked", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      bookmarked: true,
      voiceHistory: [userTextItem("keep")],
      messages: [],
    });

    await saveConversation(record);
    window.location.hash = record.id;
    const onLiveRecordDeleted = vi.fn();

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [], onLiveRecordDeleted }),
    );

    await waitForEffects();
    await act(() => result.current.deleteUnbookmarkedConversations());

    expect(onLiveRecordDeleted).not.toHaveBeenCalled();
  });

  it("deleteAllConversations clears DB and resets state", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      voiceHistory: [userTextItem("hi")],
      messages: [],
    });

    await saveConversation(record);
    window.location.hash = record.id;

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    expect(result.current.conversations).toHaveLength(1);

    await act(() => result.current.deleteAllConversations());

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.savedItems).toStrictEqual([]);
  });

  it("deleteUnbookmarkedConversations clears unbookmarked but keeps bookmarked", async () => {
    const bookmarked = createTestRecord({
      id: "bk-1",
      sessionType: "voice",
      bookmarked: true,
      voiceHistory: [userTextItem("keep")],
      messages: [],
    });
    const unbookmarked = createTestRecord({
      id: "ub-1",
      sessionType: "voice",
      bookmarked: false,
      voiceHistory: [userTextItem("toss")],
      messages: [],
    });

    await saveConversation(bookmarked);
    await saveConversation(unbookmarked);
    window.location.hash = unbookmarked.id;

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    expect(result.current.conversations).toHaveLength(2);

    await act(() => result.current.deleteUnbookmarkedConversations());

    expect(result.current.conversations.map((c) => c.id)).toStrictEqual([
      "bk-1",
    ]);
    // Active was unbookmarked, so it gets cleared
    expect(result.current.activeConversationId).toBeNull();
  });

  it("updates ref state when renaming/bookmarking/deleting the active conversation", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      voiceHistory: [userTextItem("a")],
      messages: [],
    });

    await saveConversation(record);
    window.location.hash = record.id;

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    await act(() => result.current.renameConversation(record.id, "Renamed"));
    await act(() => result.current.toggleBookmark(record.id));
    await act(() => result.current.deleteConversation(record.id));

    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.savedItems).toStrictEqual([]);
  });

  it("switchConversation handles voice records with no saved history", async () => {
    const voiceEmpty = createTestRecord({
      sessionType: "voice",
      voiceHistory: null,
      messages: [],
    });

    await saveConversation(voiceEmpty);

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    await act(() => result.current.switchConversation(voiceEmpty.id));

    expect(result.current.activeConversationId).toBe(voiceEmpty.id);
    expect(result.current.savedItems).toStrictEqual([]);
  });

  it("preserves the active bookmark ref when toggling a non-active conversation", async () => {
    const active = createTestRecord({
      id: "active",
      sessionType: "voice",
      voiceHistory: [userTextItem("a")],
      messages: [],
    });
    const other = createTestRecord({
      id: "other",
      sessionType: "voice",
      voiceHistory: [],
      messages: [],
    });

    await saveConversation(active);
    await saveConversation(other);
    window.location.hash = active.id;

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    await act(() => result.current.toggleBookmark(other.id));

    const otherSummary = result.current.conversations.find(
      (c) => c.id === other.id,
    );

    expect(otherSummary?.bookmarked).toBe(true);
    // Active's bookmark stays unchanged
    const loadedActive = await loadConversation(active.id);

    expect(loadedActive?.bookmarked).toBe(false);
  });

  it("returns null title when transcripts are empty or only contain assistant items", async () => {
    const emptyUserItem = {
      type: "message",
      role: "user",
      content: [{ type: "input_audio", transcript: null }],
    } as unknown as RealtimeItem;

    const { result, rerender } = renderHook(
      ({ history }: { history: RealtimeItem[] }) =>
        useVoicePersistence({ liveHistory: history }),
      { initialProps: { history: [] as RealtimeItem[] } },
    );

    await waitForEffects();
    rerender({ history: [emptyUserItem] });
    await waitForEffects(800);

    const loaded = await loadConversation(
      result.current.activeConversationId as string,
    );

    expect(loaded?.title).toBeNull();
  });

  it("preserves prior function_call items when auto-saving a continued session", async () => {
    const functionCall = {
      itemId: "fc1",
      type: "function_call",
      status: "completed",
      name: "ppal-read-track",
      arguments: "{}",
      output: '{"result":"ok"}',
    } as unknown as RealtimeItem;

    const userMsg = {
      itemId: "u1",
      type: "message",
      role: "user",
      status: "completed",
      content: [{ type: "input_audio", transcript: "earlier" }],
    } as unknown as RealtimeItem;

    const priorRecord = createTestRecord({
      sessionType: "voice",
      // Saved record has a function_call sandwiched between messages.
      voiceHistory: [userMsg, functionCall],
      messages: [],
    });

    await saveConversation(priorRecord);
    window.location.hash = priorRecord.id;

    // Continuation: the live SDK history only contains the primed message
    // (function_call dropped during priming) plus a new user turn.
    const continuation: RealtimeItem[] = [
      userMsg,
      {
        itemId: "u2",
        type: "message",
        role: "user",
        status: "completed",
        content: [{ type: "input_audio", transcript: "follow-up" }],
      } as unknown as RealtimeItem,
    ];

    const { rerender } = renderHook(
      ({ history }: { history: RealtimeItem[] }) =>
        useVoicePersistence({ liveHistory: history }),
      { initialProps: { history: [] as RealtimeItem[] } },
    );

    await waitForEffects();
    rerender({ history: continuation });
    await waitForEffects(800);

    const loaded = await loadConversation(priorRecord.id);

    expect(
      loaded?.voiceHistory?.map((i) => (i as RealtimeItem).itemId),
    ).toStrictEqual(["u1", "fc1", "u2"]);
  });

  it("renames and toggles bookmark on a saved conversation", async () => {
    const record = createTestRecord({
      sessionType: "voice",
      voiceHistory: [],
      messages: [],
    });

    await saveConversation(record);

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();
    await act(() => result.current.renameConversation(record.id, "Renamed"));
    expect(result.current.conversations[0]?.title).toBe("Renamed");

    await act(() => result.current.toggleBookmark(record.id));
    expect(result.current.conversations[0]?.bookmarked).toBe(true);

    await act(() => result.current.toggleBookmark("missing"));
    // unknown id is a no-op — list is unchanged
    expect(result.current.conversations).toHaveLength(1);
  });
});
