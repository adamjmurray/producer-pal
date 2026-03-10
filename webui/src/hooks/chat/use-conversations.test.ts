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
  saveConversation,
} from "#webui/lib/conversation-db";
import { type Provider } from "#webui/types/settings";
import { useConversations } from "./use-conversations";

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
 * Read the conversation ID from the current URL hash.
 * @returns The hash value without the leading #, or empty string
 */
function getHash(): string {
  return window.location.hash.slice(1);
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

  it("initializes with empty conversations list", async () => {
    const { result } = await setupHook();

    expect(result.current.conversations).toStrictEqual([]);
    expect(result.current.activeConversationId).toBeNull();
  });

  it("saves current conversation and updates URL hash", async () => {
    const { state, result } = await setupHook();

    await saveWithMessage(state, result);

    expect(result.current.activeConversationId).not.toBeNull();
    expect(result.current.conversations).toHaveLength(1);
    expect(getHash()).toBe(result.current.activeConversationId);
  });

  it("persists active model and provider in saved conversation", async () => {
    const { props, state } = createProps();

    props.activeModel = "gemini-2.5-pro";
    props.activeProvider = "gemini";

    const { result } = renderHook(() => useConversations(props));

    await waitForEffects();

    await saveWithMessage(state, result);

    const loaded = await loadConversation(result.current.activeConversationId!);

    expect(loaded?.model).toBe("gemini-2.5-pro");
    expect(loaded?.provider).toBe("gemini");
  });

  it("does not save when chat history is empty", async () => {
    const { result } = await setupHook();

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.conversations).toHaveLength(0);
  });

  it("switches between conversations", async () => {
    const { props, state } = createProps();

    // Pre-populate DB with a conversation
    const existingId = crypto.randomUUID();

    await saveConversation({
      id: existingId,
      title: null,
      createdAt: 1000,
      updatedAt: 1000,
      bookmarked: false,
      provider: "gemini",
      model: "gemini-2.5-pro",
      modelLabel: "Gemini 2.5 Pro",
      thinking: null,
      temperature: null,
      showThoughts: null,
      smallModelMode: null,
      messages: [{ role: "user", content: "existing conversation" }],
    });

    const { result } = renderHook(() => useConversations(props));

    await waitForEffects();

    // Create a current conversation first
    state.chatHistory = [{ role: "user", content: "current" }];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    // Switch to existing
    await act(async () => {
      await result.current.switchConversation(existingId);
    });

    expect(result.current.activeConversationId).toBe(existingId);
    expect(props.clearConversation).toHaveBeenCalled();
    expect(props.restoreChatHistory).toHaveBeenCalledWith(
      [{ role: "user", content: "existing conversation" }],
      {
        model: "gemini-2.5-pro",
        provider: "gemini",
        thinking: null,
        temperature: null,
        showThoughts: null,
        smallModelMode: null,
      },
    );
  });

  it("starts a new conversation and clears hash", async () => {
    const { props, state, result } = await setupHook();

    // Save a conversation first
    await saveWithMessage(state, result);
    expect(result.current.activeConversationId).not.toBeNull();

    // Start new
    state.chatHistory = [];

    await act(async () => {
      await result.current.startNewConversation();
    });

    expect(result.current.activeConversationId).toBeNull();
    expect(props.clearConversation).toHaveBeenCalled();
    expect(getHash()).toBe("");
  });

  it("restores conversation from URL hash on mount", async () => {
    const existingId = crypto.randomUUID();

    await saveConversation({
      id: existingId,
      title: null,
      createdAt: 1000,
      updatedAt: 1000,
      bookmarked: false,
      provider: "anthropic",
      model: "claude-sonnet-4-6-20250514",
      modelLabel: "Claude Sonnet 4.6",
      thinking: null,
      temperature: null,
      showThoughts: null,
      smallModelMode: null,
      messages: [{ role: "user", content: "restored" }],
    });
    window.location.hash = existingId;

    const { props } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await waitForEffects();

    expect(result.current.activeConversationId).toBe(existingId);
    expect(props.restoreChatHistory).toHaveBeenCalledWith(
      [{ role: "user", content: "restored" }],
      {
        model: "claude-sonnet-4-6-20250514",
        provider: "anthropic",
        thinking: null,
        temperature: null,
        showThoughts: null,
        smallModelMode: null,
      },
    );
  });

  it("clears hash when referenced conversation no longer exists", async () => {
    window.location.hash = "nonexistent-id";

    const { props } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await waitForEffects();

    expect(result.current.activeConversationId).toBeNull();
    expect(getHash()).toBe("");
    expect(props.restoreChatHistory).not.toHaveBeenCalled();
  });

  it("preserves createdAt on subsequent saves", async () => {
    const { state, result } = await setupHook();

    await saveWithMessage(state, result);
    const firstSave = result.current.conversations[0];

    // Save again with updated content
    state.chatHistory = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    const secondSave = result.current.conversations[0];

    expect(secondSave?.createdAt).toBe(firstSave?.createdAt);
    expect(secondSave?.updatedAt).toBeGreaterThanOrEqual(
      firstSave?.updatedAt ?? 0,
    );
  });

  it("auto-saves current conversation when starting new with existing history", async () => {
    const { state, result } = await setupHook();

    // Create a conversation with history
    await saveWithMessage(state, result);
    expect(result.current.conversations).toHaveLength(1);

    // Start new — should auto-save
    state.chatHistory = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];

    await act(async () => {
      await result.current.startNewConversation();
    });

    expect(result.current.activeConversationId).toBeNull();
    // The original conversation should still be saved
    expect(result.current.conversations).toHaveLength(1);
  });

  it("deletes a conversation and removes it from list", async () => {
    const { props, state, result } = await setupHook();

    await saveWithMessage(state, result);
    const savedId = result.current.activeConversationId!;

    expect(result.current.conversations).toHaveLength(1);

    await act(async () => {
      await result.current.deleteConversation(savedId);
    });

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
    expect(props.clearConversation).toHaveBeenCalled();
  });

  it("deletes a non-active conversation without clearing chat", async () => {
    const otherId = crypto.randomUUID();

    await saveConversation({
      id: otherId,
      title: null,
      createdAt: 1000,
      updatedAt: 1000,
      bookmarked: false,
      provider: null,
      model: null,
      modelLabel: null,
      thinking: null,
      temperature: null,
      showThoughts: null,
      smallModelMode: null,
      messages: [{ role: "user", content: "other" }],
    });

    const { props, state } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await waitForEffects();

    // Save a current conversation
    state.chatHistory = [{ role: "user", content: "current" }];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    expect(result.current.conversations).toHaveLength(2);

    // Delete the other one — should not affect active
    await act(async () => {
      await result.current.deleteConversation(otherId);
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeConversationId).not.toBeNull();
    expect(props.clearConversation).not.toHaveBeenCalled();
  });

  it("renames a conversation and refreshes list", async () => {
    const { state, result } = await setupHook();

    await saveWithMessage(state, result);
    const id = result.current.activeConversationId!;

    await act(async () => {
      await result.current.renameConversation(id, "My Title");
    });

    const conv = result.current.conversations.find((c) => c.id === id);

    expect(conv?.title).toBe("My Title");
  });

  it("fires beforeunload handler to save conversation", async () => {
    const { props, state } = createProps();

    renderHook(() => useConversations(props));

    await waitForEffects();

    state.chatHistory = [{ role: "user", content: "save on unload" }];

    // Trigger beforeunload event
    window.dispatchEvent(new Event("beforeunload"));

    // Give the async save a tick to complete
    await waitForEffects();

    // Verify a conversation was saved
    const db = await getConversationDb();
    const all = await db.getAll("conversations");

    expect(all).toHaveLength(1);
    expect(all[0]?.messages).toStrictEqual([
      { role: "user", content: "save on unload" },
    ]);
  });

  describe("hashchange navigation", () => {
    it("switches conversation on browser back/forward to a valid hash", async () => {
      const existingId = crypto.randomUUID();

      await saveConversation({
        id: existingId,
        title: null,
        createdAt: 1000,
        updatedAt: 1000,
        bookmarked: false,
        provider: null,
        model: null,
        modelLabel: null,
        thinking: null,
        temperature: null,
        showThoughts: null,
        smallModelMode: null,
        messages: [{ role: "user", content: "from hash" }],
      });

      const { props, result } = await setupHook();

      // Simulate browser back/forward by setting hash and dispatching event
      window.location.hash = existingId;
      await act(async () => {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(result.current.activeConversationId).toBe(existingId);
      expect(props.restoreChatHistory).toHaveBeenCalledWith(
        [{ role: "user", content: "from hash" }],
        {
          model: null,
          provider: null,
          thinking: null,
          temperature: null,
          showThoughts: null,
          smallModelMode: null,
        },
      );
    });

    it("starts new conversation on browser back to empty hash", async () => {
      const { props, state, result } = await setupHook();

      // First create an active conversation
      await saveWithMessage(state, result);
      expect(result.current.activeConversationId).not.toBeNull();

      // Simulate browser back to empty hash
      history.replaceState(null, "", window.location.pathname);
      await act(async () => {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(result.current.activeConversationId).toBeNull();
      expect(props.clearConversation).toHaveBeenCalled();
    });
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

      await saveWithMessage(state, result);
      const id = result.current.activeConversationId!;

      await act(async () => {
        await result.current.renameConversation(id, "My Custom Name");
      });

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
});
