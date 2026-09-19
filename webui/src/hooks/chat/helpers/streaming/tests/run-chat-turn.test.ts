// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import { handleMessageStream } from "#webui/hooks/chat/helpers/streaming/run-chat-turn";
import { type UIMessage } from "#webui/types/messages";

interface MockMessage {
  role: string;
  content: string;
}

function createMockFormatter() {
  return vi.fn((): UIMessage[] => [
    {
      role: "user" as const,
      parts: [],
      rawHistoryIndex: 0,
      timestamp: Date.now(),
    },
  ]);
}

async function* createThrowingStream(
  error: Error,
): AsyncGenerator<MockMessage[], void, unknown> {
  yield [];
  throw error;
}

describe("handleMessageStream", () => {
  it("should handle successful stream", async () => {
    const mockHistory: MockMessage[][] = [[{ role: "user", content: "hi" }]];
    const mockStream = (async function* () {
      for (const h of mockHistory) {
        yield h;
      }
    })();
    const onUpdate = vi.fn();

    const result = await handleMessageStream(
      mockStream,
      createMockFormatter(),
      onUpdate,
    );

    expect(result).toBe(true);
    expect(onUpdate).toHaveBeenCalled();
  });

  it("should handle AbortError", async () => {
    const result = await handleMessageStream(
      createThrowingStream(new DOMException("Aborted", "AbortError")),
      createMockFormatter(),
      vi.fn(),
    );

    expect(result).toBe(false);
  });

  it("should re-throw non-AbortError", async () => {
    await expect(
      handleMessageStream(
        createThrowingStream(new Error("Network failure")),
        createMockFormatter(),
        vi.fn(),
      ),
    ).rejects.toThrow("Network failure");
  });
});
