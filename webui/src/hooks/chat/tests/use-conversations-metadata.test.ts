// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { renderHook, act } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConversationDb,
  loadConversation,
  resetDbCache,
} from "#webui/lib/conversation-db";
import { type Provider } from "#webui/types/settings";
import { useConversations } from "#webui/hooks/chat/use-conversations";

/**
 * Creates default props for useConversations tests.
 * @returns Props with vi.fn() mocks and an updatable chatHistory
 */
function createProps() {
  const state = { chatHistory: [] as unknown[] };

  return {
    state,
    props: {
      getChatHistory: vi.fn(() => state.chatHistory),
      restoreChatHistory: vi.fn(),
      clearConversation: vi.fn(),
      activeModel: null as string | null,
      activeProvider: null as Provider | null,
      activeThinking: null as string | null,
      activeTemperature: null as number | null,
      activeShowThoughts: null as boolean | null,
      activeSmallModelMode: null as boolean | null,
    },
  };
}

/** Wait for async effects to settle. */
async function waitForEffects(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

/**
 * Create props, render hook, and wait for init.
 * @returns Props, state, and hook result
 */
async function setupHook() {
  const { props, state } = createProps();
  const { result } = renderHook(() => useConversations(props));

  await waitForEffects();

  return { props, state, result };
}

/**
 * Set chat history and save the current conversation.
 * @param state - Mock state object with chatHistory
 * @param result - Hook result ref with saveCurrentConversation
 * @param content - Message content (default "hello")
 */
async function saveWithMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper with loose typing
  state: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper with loose typing
  result: any,
  content = "hello",
) {
  state.chatHistory = [{ role: "user", content }];
  await act(() => result.current.saveCurrentConversation());
}

/**
 * Save a message and rename the resulting conversation.
 * @param state - Mock state object with chatHistory
 * @param result - Hook result ref
 * @param title - New title to assign
 * @returns The conversation ID
 */
async function saveAndRename(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper with loose typing
  state: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper with loose typing
  result: any,
  title: string,
): Promise<string> {
  await saveWithMessage(state, result);
  const id = result.current.activeConversationId!;

  await act(async () => {
    await result.current.renameConversation(id, title);
  });

  return id;
}

describe("useConversations", () => {
  beforeEach(async () => {
    await resetDbCache();
    const db = await getConversationDb();

    await db.clear("conversations");
    window.location.hash = "";
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("auto-title derivation", () => {
    it("sets title from first user message", async () => {
      const { state, result } = await setupHook();

      state.chatHistory = [{ role: "user", content: "How do I add drums?" }];

      await act(async () => {
        await result.current.saveCurrentConversation();
      });

      expect(result.current.conversations[0]?.title).toBe(
        "How do I add drums?",
      );
    });

    it("uses only first line of multiline message", async () => {
      const { state, result } = await setupHook();

      state.chatHistory = [
        { role: "user", content: "First line\nSecond line\nThird" },
      ];

      await act(async () => {
        await result.current.saveCurrentConversation();
      });

      expect(result.current.conversations[0]?.title).toBe("First line");
    });

    it("replaces connect-variant title with second user message", async () => {
      const { state, result } = await setupHook();

      state.chatHistory = [
        { role: "user", content: "Connect to Ableton" },
        { role: "assistant", content: "Connected!" },
      ];

      await act(async () => {
        await result.current.saveCurrentConversation();
      });

      // Only one user message so far — keeps connect title
      expect(result.current.conversations[0]?.title).toBe("Connect to Ableton");

      // Second user message arrives
      state.chatHistory = [
        { role: "user", content: "Connect to Ableton" },
        { role: "assistant", content: "Connected!" },
        { role: "user", content: "Add a bass track" },
      ];

      await act(async () => {
        await result.current.saveCurrentConversation();
      });

      expect(result.current.conversations[0]?.title).toBe("Add a bass track");
    });

    it("falls back to connect title when second user message is empty", async () => {
      const { state, result } = await setupHook();

      state.chatHistory = [
        { role: "user", content: "connect" },
        { role: "assistant", content: "Connected!" },
        { role: "user", content: "" },
      ];

      await act(async () => {
        await result.current.saveCurrentConversation();
      });

      expect(result.current.conversations[0]?.title).toBe("connect");
    });

    it("returns null title when only user message has empty content", async () => {
      const { state, result } = await setupHook();

      state.chatHistory = [{ role: "user", content: "" }];

      await act(async () => {
        await result.current.saveCurrentConversation();
      });

      // Empty content means no title can be derived
      expect(result.current.conversations[0]?.title).toBeNull();
    });

    it("preserves manually renamed title", async () => {
      const { state, result } = await setupHook();

      await saveAndRename(state, result, "My Custom Name");

      // Save again — should keep the manual name
      state.chatHistory = [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ];

      await act(async () => {
        await result.current.saveCurrentConversation();
      });

      expect(result.current.conversations[0]?.title).toBe("My Custom Name");
    });
  });

  describe("active ref sync", () => {
    it("persists thinking/temperature/showThoughts from active refs", async () => {
      const { props, state } = createProps();

      props.activeThinking = "enabled";
      props.activeTemperature = 0.7;
      props.activeShowThoughts = true;

      const { result } = renderHook(() => useConversations(props));

      await waitForEffects();
      await saveWithMessage(state, result, "ref sync");
      const record = await loadConversation(
        result.current.activeConversationId!,
      );

      expect(record).toMatchObject({
        thinking: "enabled",
        temperature: 0.7,
        showThoughts: true,
      });

      // Change props, wait for effect to sync refs, then save and verify
      props.activeThinking = "disabled";
      props.activeTemperature = 1.0;
      props.activeShowThoughts = false;
      // saveWithMessage triggers rerender which runs the ref-sync useEffect
      await saveWithMessage(state, result, "ref sync 2");
      await waitForEffects();
      await saveWithMessage(state, result, "ref sync 3");

      const updated = await loadConversation(
        result.current.activeConversationId!,
      );

      expect(updated).toMatchObject({
        thinking: "disabled",
        temperature: 1.0,
        showThoughts: false,
      });
    });
  });

  describe("bookmark toggling", () => {
    it("toggles bookmark on a conversation", async () => {
      const { state, result } = await setupHook();

      await saveWithMessage(state, result);
      const id = result.current.activeConversationId!;

      expect(result.current.conversations[0]?.bookmarked).toBe(false);

      await act(async () => {
        await result.current.toggleBookmark(id);
      });

      expect(result.current.conversations[0]?.bookmarked).toBe(true);

      await act(async () => {
        await result.current.toggleBookmark(id);
      });

      expect(result.current.conversations[0]?.bookmarked).toBe(false);
    });

    it("is a no-op for nonexistent conversation", async () => {
      const { result } = await setupHook();

      await act(async () => {
        await result.current.toggleBookmark("nonexistent");
      });

      expect(result.current.conversations).toHaveLength(0);
    });
  });

  describe("bulk deletion", () => {
    it("deleteAllConversations clears all and resets active", async () => {
      const { state, props } = createProps();
      const { result } = renderHook(() => useConversations(props));

      await waitForEffects();

      state.chatHistory = [{ role: "user", content: "hi" }];
      await act(async () => {
        await result.current.saveCurrentConversation();
      });

      expect(result.current.conversations).toHaveLength(1);

      await act(async () => {
        await result.current.deleteAllConversations();
      });

      expect(result.current.conversations).toHaveLength(0);
      expect(result.current.activeConversationId).toBeNull();
      expect(props.clearConversation).toHaveBeenCalled();
    });

    it("deleteUnbookmarkedConversations keeps bookmarked and clears unbookmarked active", async () => {
      const { state, props } = createProps();
      const { result } = renderHook(() => useConversations(props));

      await waitForEffects();

      // Save two conversations
      state.chatHistory = [{ role: "user", content: "first" }];
      await act(async () => {
        await result.current.saveCurrentConversation();
      });
      const firstId = result.current.activeConversationId!;

      // Start new and save second
      void act(() => result.current.startNewConversation());
      state.chatHistory = [{ role: "user", content: "second" }];
      await act(async () => {
        await result.current.saveCurrentConversation();
      });

      // Bookmark first conversation
      await act(async () => {
        await result.current.toggleBookmark(firstId);
      });

      // Active is the second (unbookmarked) conversation
      expect(result.current.conversations).toHaveLength(2);

      await act(async () => {
        await result.current.deleteUnbookmarkedConversations();
      });

      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.conversations[0]?.id).toBe(firstId);
      // Active was unbookmarked, so should be cleared
      expect(result.current.activeConversationId).toBeNull();
      expect(props.clearConversation).toHaveBeenCalled();
    });
  });
});
