// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { type RealtimeItem } from "@openai/agents/realtime";
import { act } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GEMINI_REALTIME_MODEL } from "#webui/lib/constants/models";
import { loadConversation, saveConversation } from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import {
  bulkDeleteDuringPendingNewSave,
  continueSavedVoiceSession,
  fireHashChange,
  renderVoicePersistence,
  renderVoicePersistenceWithHistory,
  resetConversationsDb,
  saveVoiceRecord,
  setupForeignTextRecord,
  setupLiveRecordWithDeletionSpy,
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
    const { result } = renderVoicePersistence();

    await waitForEffects();

    expect(result.current.conversations).toStrictEqual([]);
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.savedItems).toStrictEqual([]);
  });

  it("auto-saves the live transcript with sessionType=voice", async () => {
    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();
    rerender([userTextItem("hi pal")]);
    await waitForEffects(800);

    expect(result.current.activeConversationId).not.toBeNull();

    const loaded = await loadConversation(
      result.current.activeConversationId as string,
    );

    expect(loaded?.sessionType).toBe("voice");
    expect(loaded?.title).toBe("hi pal");
    expect(loaded?.voiceHistory ?? []).toHaveLength(1);
  });

  it("stamps the configured realtime model on saved records", async () => {
    const { result, rerender } = renderVoicePersistenceWithHistory({
      model: "gpt-4o-realtime-preview",
    });

    await waitForEffects();
    rerender([userTextItem("hey")]);
    await waitForEffects(800);

    const loaded = await loadConversation(
      result.current.activeConversationId as string,
    );

    expect(loaded?.model).toBe("gpt-4o-realtime-preview");
    expect(loaded?.modelLabel).toBe("gpt-4o-realtime-preview");
  });

  it("preserves an existing record's model when continued under different settings", async () => {
    // A record created with one realtime model, then continued (Stop → Talk)
    // while current settings point at a different realtime model, must keep its
    // original model/label rather than being silently re-stamped.
    const record = await saveVoiceRecord({
      model: "gpt-realtime-original",
      modelLabel: "gpt-realtime-original",
      voiceHistory: [userTextItem("first turn")],
    });

    const { result, loaded } = await continueSavedVoiceSession(
      record,
      "gpt-realtime-current",
    );

    expect(result.current.activeConversationId).toBe(record.id);
    expect(loaded?.model).toBe("gpt-realtime-original");
    expect(loaded?.modelLabel).toBe("gpt-realtime-original");
  });

  it("stamps the gemini provider on records saved with a Gemini realtime model", async () => {
    const { result, rerender } = renderVoicePersistenceWithHistory({
      model: GEMINI_REALTIME_MODEL,
    });

    await waitForEffects();
    rerender([userTextItem("hey")]);
    await waitForEffects(800);

    const loaded = await loadConversation(
      result.current.activeConversationId as string,
    );

    expect(loaded?.provider).toBe("gemini");
    expect(loaded?.model).toBe(GEMINI_REALTIME_MODEL);
  });

  it("preserves an existing record's provider when continued under a different backend", async () => {
    const record = await saveVoiceRecord({
      provider: "openai",
      model: "gpt-realtime-original",
      voiceHistory: [userTextItem("first turn")],
    });

    const { result, loaded } = await continueSavedVoiceSession(
      record,
      GEMINI_REALTIME_MODEL,
    );

    expect(result.current.activeConversationId).toBe(record.id);
    expect(loaded?.provider).toBe("openai");
  });

  it("exposes the loaded record's model via activeRecordModel (hash load)", async () => {
    const record = await saveVoiceRecord({ model: "gpt-realtime-original" });

    window.location.hash = record.id;

    const { result } = renderVoicePersistence();

    await waitForEffects();

    expect(result.current.activeRecordModel).toBe("gpt-realtime-original");
  });

  it("exposes the loaded record's provider via activeRecordProvider (hash load)", async () => {
    // Drives record-aware backend routing in use-voice-mode-state — without
    // this a saved Gemini record would silently resume on the OpenAI backend
    // (or vice versa) when current settings select the other provider.
    const record = await saveVoiceRecord({
      provider: "gemini",
      model: GEMINI_REALTIME_MODEL,
    });

    window.location.hash = record.id;

    const { result } = renderVoicePersistence();

    await waitForEffects();

    expect(result.current.activeRecordProvider).toBe("gemini");
  });

  it("tracks activeRecordProvider across switch and clears it on a new conversation", async () => {
    const record = await saveVoiceRecord({
      provider: "openai",
      model: "gpt-realtime-2",
    });

    const { result } = renderVoicePersistence();

    await waitForEffects();
    expect(result.current.activeRecordProvider).toBeNull();

    await act(() => result.current.switchConversation(record.id));
    expect(result.current.activeRecordProvider).toBe("openai");

    await act(() => result.current.startNewConversation());
    expect(result.current.activeRecordProvider).toBeNull();
  });

  it("tracks activeRecordModel across switch and clears it on a new conversation", async () => {
    const record = await saveVoiceRecord({ model: "gpt-realtime-original" });

    const { result } = renderVoicePersistence();

    await waitForEffects();
    expect(result.current.activeRecordModel).toBeNull();

    await act(() => result.current.switchConversation(record.id));
    expect(result.current.activeRecordModel).toBe("gpt-realtime-original");

    await act(() => result.current.startNewConversation());
    expect(result.current.activeRecordModel).toBeNull();
  });

  it("reuses one reserved id across rapid updates, creating a single record", async () => {
    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();
    // Two transcript updates land before any save resolves and adopts an
    // active id. Both autosave effect runs must reuse the same reserved id,
    // otherwise the second mints a fresh UUID and creates a duplicate record.
    rerender([userTextItem("first")]);
    rerender([userTextItem("first"), userTextItem("second")]);
    await waitForEffects(800);

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0]?.id).toBe(
      result.current.activeConversationId,
    );
  });

  it("derives a title from the first user transcript", async () => {
    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();
    rerender([userTranscriptItem("make me a clip")]);
    await waitForEffects(800);

    const loaded = await loadConversation(
      result.current.activeConversationId as string,
    );

    expect(loaded?.title).toBe("make me a clip");
  });

  it("clears the active id when the hash points to a missing record", async () => {
    window.location.hash = "missing-id";

    const { result } = renderVoicePersistence();

    await waitForEffects();

    expect(result.current.activeConversationId).toBeNull();
  });

  it("auto-saves with a null title when no user message is present yet", async () => {
    const assistantOnly = {
      type: "message",
      role: "assistant",
      content: [{ type: "output_audio", transcript: "hello" }],
    } as unknown as RealtimeItem;

    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();
    rerender([assistantOnly]);
    await waitForEffects(800);

    const loaded = await loadConversation(
      result.current.activeConversationId as string,
    );

    expect(loaded?.title).toBeNull();
  });

  it("loads a saved voice conversation from the URL hash on mount", async () => {
    const voiceRecord = await saveVoiceRecord({
      voiceHistory: [userTextItem("from hash")],
    });

    window.location.hash = voiceRecord.id;

    const { result } = renderVoicePersistence();

    await waitForEffects();

    expect(result.current.activeConversationId).toBe(voiceRecord.id);
    expect(result.current.savedItems).toHaveLength(1);
  });

  it("invokes onForeignRecord when the hash points to a text conversation", async () => {
    const textRecord = createTestRecord({ sessionType: "text" });

    await saveConversation(textRecord);
    window.location.hash = textRecord.id;

    const onForeignRecord = vi.fn();

    renderVoicePersistence({ onForeignRecord });
    await waitForEffects();

    expect(onForeignRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: textRecord.id }),
    );
  });

  it("clears the hash when a text record is loaded without an onForeignRecord handler", async () => {
    const textRecord = createTestRecord({ sessionType: "text" });

    await saveConversation(textRecord);
    window.location.hash = textRecord.id;

    const { result } = renderVoicePersistence();

    await waitForEffects();
    expect(result.current.activeConversationId).toBeNull();
  });

  it("startNewConversation clears active id and saved items", async () => {
    const voiceRecord = await saveVoiceRecord({
      voiceHistory: [userTextItem("saved")],
    });

    window.location.hash = voiceRecord.id;

    const { result } = renderVoicePersistence();

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
    const voiceRecord = await saveVoiceRecord({
      voiceHistory: [userTextItem("voice content")],
    });

    const { result } = renderVoicePersistence();

    await waitForEffects();
    await act(() => result.current.switchConversation(voiceRecord.id));

    expect(result.current.activeConversationId).toBe(voiceRecord.id);
    expect(result.current.savedItems).toHaveLength(1);
  });

  it("switchConversation clears active state when the record is missing", async () => {
    const { result } = renderVoicePersistence();

    await waitForEffects();
    await act(() => result.current.switchConversation("does-not-exist"));

    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.savedItems).toStrictEqual([]);
  });

  it("switchConversation invokes onForeignRecord for text records", async () => {
    const { textRecord, onForeignRecord, result } =
      await setupForeignTextRecord();

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

    const { result } = renderVoicePersistence({ onForeignRecord });

    await waitForEffects();

    await act(() => result.current.switchConversation(textRecord.id));

    // The new mode mounts after onForeignRecord settles state, so the hash
    // must point to the foreign id *before* the callback fires.
    expect(hashWhenForeignCalled).toBe("#chat-1");
  });

  it("deletes a conversation and refreshes the list", async () => {
    const record = await saveVoiceRecord({ voiceHistory: [] });

    const { result } = renderVoicePersistence();

    await waitForEffects();
    expect(result.current.conversations).toHaveLength(1);

    await act(() => result.current.deleteConversation(record.id));

    expect(result.current.conversations).toHaveLength(0);
  });

  it("does not resurrect a conversation deleted while its autosave is pending", async () => {
    const record = await saveVoiceRecord({
      voiceHistory: [userTextItem("original")],
    });

    window.location.hash = record.id;

    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();
    expect(result.current.activeConversationId).toBe(record.id);

    // A new transcript turn schedules the debounced autosave for record.id...
    rerender([userTextItem("a new turn")]);
    // ...then the user deletes the active conversation before it fires.
    await act(() => result.current.deleteConversation(record.id));
    // Let the debounce fire; the in-flight save must bail, not re-create it.
    await waitForEffects(800);

    expect(await loadConversation(record.id)).toBeUndefined();
    expect(result.current.conversations).toHaveLength(0);
  });

  it("deleteAllConversations works when no conversation is active", async () => {
    await saveVoiceRecord({
      voiceHistory: [userTextItem("hi")],
    });

    const { result } = renderVoicePersistence();

    await waitForEffects();
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.conversations).toHaveLength(1);

    await act(() => result.current.deleteAllConversations());

    expect(result.current.conversations).toHaveLength(0);
  });

  it("does not resurrect a pending new conversation deleted via deleteAllConversations", async () => {
    // Delete-all lands during the pre-adoption window. It doesn't stop the
    // session, so the reserved-id autosave is still scheduled — and must bail
    // rather than create a record.
    const result = await bulkDeleteDuringPendingNewSave((hook) =>
      hook.deleteAllConversations(),
    );

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
  });

  it("does not resurrect a pending new conversation deleted via deleteUnbookmarkedConversations", async () => {
    // A pending-new conversation is unbookmarked, so the bulk delete targets it.
    const result = await bulkDeleteDuringPendingNewSave((hook) =>
      hook.deleteUnbookmarkedConversations(),
    );

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
  });

  it("fires onLiveRecordDeleted when deleteAllConversations removes the live record", async () => {
    const { result, onLiveRecordDeleted } =
      await setupLiveRecordWithDeletionSpy();

    await act(() => result.current.deleteAllConversations());

    expect(onLiveRecordDeleted).toHaveBeenCalledOnce();
  });

  it("does not fire onLiveRecordDeleted when deleteAllConversations has no live record", async () => {
    await saveVoiceRecord({
      voiceHistory: [userTextItem("other")],
    });
    // No hash → no active/pending live record, just a stored conversation.
    const onLiveRecordDeleted = vi.fn();

    const { result } = renderVoicePersistence({ onLiveRecordDeleted });

    await waitForEffects();
    await act(() => result.current.deleteAllConversations());

    expect(onLiveRecordDeleted).not.toHaveBeenCalled();
  });

  it("fires onLiveRecordDeleted when deleteUnbookmarked removes an unbookmarked live record", async () => {
    const { result, onLiveRecordDeleted } =
      await setupLiveRecordWithDeletionSpy({ bookmarked: false });

    await act(() => result.current.deleteUnbookmarkedConversations());

    expect(onLiveRecordDeleted).toHaveBeenCalledOnce();
  });

  it("does not fire onLiveRecordDeleted when the live record is bookmarked", async () => {
    const { result, onLiveRecordDeleted } =
      await setupLiveRecordWithDeletionSpy({
        bookmarked: true,
        voiceHistory: [userTextItem("keep")],
      });

    await act(() => result.current.deleteUnbookmarkedConversations());

    expect(onLiveRecordDeleted).not.toHaveBeenCalled();
  });

  it("deleteAllConversations clears DB and resets state", async () => {
    const record = await saveVoiceRecord({
      voiceHistory: [userTextItem("hi")],
    });

    window.location.hash = record.id;

    const { result } = renderVoicePersistence();

    await waitForEffects();
    expect(result.current.conversations).toHaveLength(1);

    await act(() => result.current.deleteAllConversations());

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.savedItems).toStrictEqual([]);
  });

  it("deleteUnbookmarkedConversations clears unbookmarked but keeps bookmarked", async () => {
    await saveVoiceRecord({
      id: "bk-1",
      bookmarked: true,
      voiceHistory: [userTextItem("keep")],
    });
    const unbookmarked = await saveVoiceRecord({
      id: "ub-1",
      bookmarked: false,
      voiceHistory: [userTextItem("toss")],
    });

    window.location.hash = unbookmarked.id;

    const { result } = renderVoicePersistence();

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
    const record = await saveVoiceRecord({
      voiceHistory: [userTextItem("a")],
    });

    window.location.hash = record.id;

    const { result } = renderVoicePersistence();

    await waitForEffects();
    await act(() => result.current.renameConversation(record.id, "Renamed"));
    await act(() => result.current.toggleBookmark(record.id));
    await act(() => result.current.deleteConversation(record.id));

    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.savedItems).toStrictEqual([]);
  });

  it("switchConversation handles voice records with no saved history", async () => {
    const voiceEmpty = await saveVoiceRecord({ voiceHistory: null });

    const { result } = renderVoicePersistence();

    await waitForEffects();
    await act(() => result.current.switchConversation(voiceEmpty.id));

    expect(result.current.activeConversationId).toBe(voiceEmpty.id);
    expect(result.current.savedItems).toStrictEqual([]);
  });

  it("preserves the active bookmark ref when toggling a non-active conversation", async () => {
    const active = await saveVoiceRecord({
      id: "active",
      voiceHistory: [userTextItem("a")],
    });
    const other = await saveVoiceRecord({ id: "other", voiceHistory: [] });

    window.location.hash = active.id;

    const { result } = renderVoicePersistence();

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

    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();
    rerender([emptyUserItem]);
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

    const priorRecord = await saveVoiceRecord({
      // Saved record has a function_call sandwiched between messages.
      voiceHistory: [userMsg, functionCall],
    });

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

    const { rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();
    rerender(continuation);
    await waitForEffects(800);

    const loaded = await loadConversation(priorRecord.id);

    expect(
      loaded?.voiceHistory?.map((i) => (i as RealtimeItem).itemId),
    ).toStrictEqual(["u1", "fc1", "u2"]);
  });

  it("retainPriorHistory keeps tool calls across a same-sitting Stop → Talk", async () => {
    // A conversation started AND continued in one sitting (Stop → Talk, no
    // sidebar reload) never loads a record, so savedItems / priorItemsRef start
    // empty and the autosave merge has no prior to protect the tool call. On
    // reconnect the realtime SDK reseeds messages only (function_call items are
    // dropped), so without retainPriorHistory the next autosave would overwrite
    // the saved record's tool call — and it would vanish from the transcript.
    const userMsg = {
      itemId: "u1",
      type: "message",
      role: "user",
      status: "completed",
      content: [{ type: "input_audio", transcript: "earlier" }],
    } as unknown as RealtimeItem;
    const functionCall = {
      itemId: "fc1",
      type: "function_call",
      status: "completed",
      name: "ppal-read-track",
      arguments: "{}",
      output: '{"result":"ok"}',
    } as unknown as RealtimeItem;

    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();
    // Sub-session 1: a transcript with a tool call is autosaved to a fresh record.
    rerender([userMsg, functionCall]);
    await waitForEffects(800);

    const id = result.current.activeConversationId as string;
    const initial = await loadConversation(id);

    expect(initial?.voiceHistory).toHaveLength(2);

    // Stop → Talk: the controls promote the full displayed transcript (still
    // holding the tool call) into the prior snapshot before reconnecting.
    await act(() => result.current.retainPriorHistory([userMsg, functionCall]));

    // Reseeded session echoes back the message only (fc1 dropped), then a new
    // turn arrives. The autosave must not clobber the saved tool call.
    rerender([
      userMsg,
      {
        itemId: "u2",
        type: "message",
        role: "user",
        status: "completed",
        content: [{ type: "input_audio", transcript: "follow-up" }],
      } as unknown as RealtimeItem,
    ]);
    await waitForEffects(800);

    const loaded = await loadConversation(id);

    expect(
      loaded?.voiceHistory?.map((i) => (i as RealtimeItem).itemId),
    ).toStrictEqual(["u1", "fc1", "u2"]);
    // ...and the tool call stays in the read-only/display source.
    expect(result.current.savedItems.map((i) => i.itemId)).toContain("fc1");
  });

  it("renames and toggles bookmark on a saved conversation", async () => {
    const record = await saveVoiceRecord({ voiceHistory: [] });

    const { result } = renderVoicePersistence();

    await waitForEffects();
    await act(() => result.current.renameConversation(record.id, "Renamed"));
    expect(result.current.conversations[0]?.title).toBe("Renamed");

    await act(() => result.current.toggleBookmark(record.id));
    expect(result.current.conversations[0]?.bookmarked).toBe(true);

    await act(() => result.current.toggleBookmark("missing"));
    // unknown id is a no-op — list is unchanged
    expect(result.current.conversations).toHaveLength(1);
  });

  describe("hashchange navigation (browser back/forward)", () => {
    it("switches to a voice conversation when the hash changes to its id", async () => {
      const record = await saveVoiceRecord({
        voiceHistory: [userTextItem("from history")],
      });

      const { result } = renderVoicePersistence();

      await waitForEffects();
      expect(result.current.activeConversationId).toBeNull();

      window.location.hash = record.id;
      await fireHashChange();

      expect(result.current.activeConversationId).toBe(record.id);
      expect(result.current.savedItems).toHaveLength(1);
    });

    it("starts a fresh session when the hash is cleared by back", async () => {
      const record = await saveVoiceRecord({
        voiceHistory: [userTextItem("seed")],
      });

      window.location.hash = record.id;

      const { result } = renderVoicePersistence();

      await waitForEffects();
      expect(result.current.activeConversationId).toBe(record.id);

      history.replaceState(null, "", window.location.pathname);
      await fireHashChange();

      expect(result.current.activeConversationId).toBeNull();
    });

    it("hands a foreign chat record back to App when navigated to via history", async () => {
      const { textRecord, onForeignRecord, result } =
        await setupForeignTextRecord();

      window.location.hash = textRecord.id;
      await fireHashChange();

      expect(onForeignRecord).toHaveBeenCalledWith(
        expect.objectContaining({ id: textRecord.id }),
      );
      expect(result.current.activeConversationId).toBe(textRecord.id);
    });
  });
});
