// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { type PendingFork } from "#webui/hooks/chat/use-chat-types";
import { useChat } from "#webui/hooks/chat/use-chat";
import {
  createMockAdapter,
  createDefaultProps,
  MockChatClient,
  RESTORED_HISTORY,
} from "./use-chat-test-helpers";

// Mock streaming helpers
vi.mock(import("#webui/hooks/chat/helpers/streaming-helpers"), async () => {
  const { streamingHelpersMockBody } = await import("./use-chat-test-helpers");

  return await streamingHelpersMockBody();
});

describe("useChat handleEdit", () => {
  const mockAdapter = createMockAdapter();
  const defaultProps = createDefaultProps(mockAdapter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing with empty message", async () => {
    const { result } = renderHook(() => useChat(defaultProps));

    await act(async () => {
      await result.current.handleSend("Hello");
    });

    vi.clearAllMocks();

    await act(async () => {
      await result.current.handleEdit(0, "   ");
    });

    expect(mockAdapter.createClient).not.toHaveBeenCalled();
  });

  it("forks conversation with new message text", async () => {
    const { result } = renderHook(() => useChat(defaultProps));

    await act(async () => {
      await result.current.handleSend("Original message");
    });

    const userIdx = result.current.messages.findIndex((m) => m.role === "user");

    await act(async () => {
      await result.current.handleEdit(userIdx, "Edited message");
    });

    const userMessage = result.current.messages.find((m) => m.role === "user");
    const userPart = userMessage?.parts[0];

    expect(userPart).toHaveProperty("content");
    expect((userPart as { content: string }).content).toBe("Edited message");
  });

  it("sets isAssistantResponding to false after completion", async () => {
    const { result } = renderHook(() => useChat(defaultProps));

    await act(async () => {
      await result.current.handleSend("Hello");
    });

    await act(async () => {
      await result.current.handleEdit(0, "New text");
    });

    expect(result.current.isAssistantResponding).toBe(false);
  });

  it("signals a pending fork before streaming when a fork ref is provided", async () => {
    const pendingForkRef = { current: null as PendingFork | null };
    const { result } = renderHook(() =>
      useChat({ ...defaultProps, pendingForkRef }),
    );

    await act(async () => {
      await result.current.handleSend("Original message");
    });

    const userIdx = result.current.messages.findIndex((m) => m.role === "user");

    await act(async () => {
      await result.current.handleEdit(userIdx, "Edited message");
    });

    // The consumer (useConversations) clears this; useChat alone leaves it set.
    expect(pendingForkRef.current).toStrictEqual({ anchorIndex: userIdx });
  });

  it("keeps the fork branch signal set when initializeChat fails (no source overwrite)", async () => {
    // Regression: the branch signal must be set BEFORE initializeChat. init
    // builds a client carrying the truncated fork history, so if it throws the
    // recovery autosave needs the signal already set to mint a new sibling — set
    // it after init and that save instead reuses the source id and overwrites it
    // with the truncated history (data loss).
    const pendingForkRef = { current: null as PendingFork | null };
    let signalWhenForkInitFailed: PendingFork | null | undefined;
    let firstInitDone = false;

    const failingInitAdapter = {
      ...mockAdapter,
      createClient: vi.fn(() => {
        const client = new MockChatClient();

        client.initialize = vi.fn(async () => {
          // Let the original send's init succeed; fail the fork's re-init and
          // capture whether the branch signal was already set at that point.
          if (firstInitDone) {
            signalWhenForkInitFailed = pendingForkRef.current;

            throw new Error("MCP connection failed");
          }

          firstInitDone = true;
        });

        return client;
      }),
    };

    const { result } = renderHook(() =>
      useChat({ ...defaultProps, adapter: failingInitAdapter, pendingForkRef }),
    );

    await act(async () => {
      await result.current.handleSend("Original message");
    });

    const userIdx = result.current.messages.findIndex((m) => m.role === "user");

    await act(async () => {
      await result.current.handleEdit(userIdx, "Edited message");
    });

    expect(signalWhenForkInitFailed).toStrictEqual({ anchorIndex: userIdx });
  });

  it("clears a pending fork signal on stopResponse", async () => {
    // A fork aborted (Stop) before it streamed assistant content never autosaves,
    // so the signal must be dropped here or it mis-branches the next save.
    const pendingForkRef = {
      current: { anchorIndex: 2 } as PendingFork | null,
    };
    const { result } = renderHook(() =>
      useChat({ ...defaultProps, pendingForkRef }),
    );

    await act(async () => {
      result.current.stopResponse();
    });

    expect(pendingForkRef.current).toBeNull();
  });

  it("clears a pending fork signal on clearConversation", async () => {
    // Every switch/new/delete/back-forward funnels through clearConversation; a
    // fork abandoned by navigating away must not leave a signal for a later,
    // unrelated conversation's save to consume.
    const pendingForkRef = {
      current: { anchorIndex: 2 } as PendingFork | null,
    };
    const { result } = renderHook(() =>
      useChat({ ...defaultProps, pendingForkRef }),
    );

    await act(async () => {
      result.current.clearConversation();
    });

    expect(pendingForkRef.current).toBeNull();
  });

  it("does nothing if message at index is not user role", async () => {
    const { result } = renderHook(() => useChat(defaultProps));

    await act(async () => {
      await result.current.handleSend("Hello");
    });

    const modelIdx = result.current.messages.findIndex(
      (m) => m.role === "model",
    );

    vi.clearAllMocks();

    await act(async () => {
      await result.current.handleEdit(modelIdx, "New text");
    });

    expect(mockAdapter.createClient).not.toHaveBeenCalled();
  });

  it("does nothing if no client and no pending history", async () => {
    const { result } = renderHook(() => useChat(defaultProps));

    await act(async () => {
      await result.current.handleEdit(0, "New text");
    });

    expect(mockAdapter.createClient).not.toHaveBeenCalled();
  });

  it("edits from restored conversation using pending history", async () => {
    const { result } = renderHook(() => useChat(defaultProps));

    await act(async () => {
      result.current.restoreChatHistory(RESTORED_HISTORY);
    });

    vi.clearAllMocks();

    await act(async () => {
      await result.current.handleEdit(0, "Edited text");
    });

    // Should create a new client and produce a response with the edited message
    expect(mockAdapter.createClient).toHaveBeenCalled();
    const editedPart = result.current.messages.find((m) => m.role === "user")!
      .parts[0] as { content: string };

    expect(editedPart.content).toBe("Edited text");
  });
});
