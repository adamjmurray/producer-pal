// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useChat } from "#webui/hooks/chat/use-chat";
import {
  createMockAdapter,
  createDefaultProps,
  RESTORED_HISTORY,
} from "./use-chat-test-helpers";

// Mock streaming helpers
vi.mock(import("#webui/hooks/chat/helpers/streaming-helpers"), () => ({
  handleMessageStream: vi.fn(async (stream, formatter, onUpdate) => {
    for await (const chatHistory of stream) {
      onUpdate(formatter(chatHistory));
    }

    return true;
  }),
  validateMcpConnection: vi.fn(),
  filterOverrides: vi.fn((overrides) => overrides),
  showMissingApiKeyError: vi.fn(),
}));

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
