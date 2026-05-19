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
import {
  getConversationDb,
  loadConversation,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

async function waitForEffects(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

const userTextItem = (text: string): RealtimeItem =>
  ({
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
  }) as unknown as RealtimeItem;

const userTranscriptItem = (transcript: string): RealtimeItem =>
  ({
    type: "message",
    role: "user",
    content: [{ type: "input_audio", transcript }],
  }) as unknown as RealtimeItem;

const originalLocation = window.location;

beforeEach(async () => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  window.location.hash = "";
  await resetDbCache();
  const db = await getConversationDb();

  await db.clear("conversations");
});

/**
 * Spy on `window.location.href = "..."` while still allowing other location
 * writes (notably `hash` and `replaceState`) to pass through.
 *
 * @returns A vi.fn that records each href assignment
 */
function spyOnHrefSetter() {
  const hrefSpy = vi.fn<(value: string) => void>();

  Object.defineProperty(window, "location", {
    configurable: true,
    value: new Proxy(originalLocation, {
      set(target, prop, value: string) {
        if (prop === "href") {
          hrefSpy(value);

          return true;
        }

        return Reflect.set(target, prop, value);
      },
      get(target, prop) {
        return Reflect.get(target, prop) as unknown;
      },
    }),
  });

  return hrefSpy;
}

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

  it("redirects to /chat when the hash points to a text conversation", async () => {
    const textRecord = createTestRecord({ sessionType: "text" });

    await saveConversation(textRecord);
    window.location.hash = textRecord.id;

    const hrefSpy = spyOnHrefSetter();

    renderHook(() => useVoicePersistence({ liveHistory: [] }));
    await waitForEffects();

    expect(hrefSpy).toHaveBeenCalledWith(`/chat#${textRecord.id}`);
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

  it("switchConversation navigates to /chat for text records", async () => {
    const textRecord = createTestRecord({ sessionType: "text" });

    await saveConversation(textRecord);

    const { result } = renderHook(() =>
      useVoicePersistence({ liveHistory: [] }),
    );

    await waitForEffects();

    const hrefSpy = spyOnHrefSetter();

    await act(() => result.current.switchConversation(textRecord.id));

    expect(hrefSpy).toHaveBeenCalledWith(`/chat#${textRecord.id}`);
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
