// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import { showMissingApiKeyError } from "#webui/hooks/chat/helpers/streaming/chat-error-recovery";

describe("showMissingApiKeyError", () => {
  const keyErrorAdapter = {
    createUserMessage: (text: string) => ({ role: "user", content: text }),
    // Mirrors the real adapter, which pushes the error onto the array it gets.
    createErrorMessage: (error: unknown, history: unknown[]) => {
      history.push({ role: "model", error });

      return history;
    },
  };

  /**
   * Run the no-API-key path over a given client and restored history.
   * @param client - The live client, or null when none has been built
   * @param pending - Restored-but-not-yet-sent history, or null
   * @returns What was rendered and what was left in the stash
   */
  function showKeyError(
    client: { chatHistory: unknown[] } | null,
    pending: unknown[] | null,
  ) {
    const setMessages = vi.fn();
    const pendingHistoryRef = { current: pending };

    showMissingApiKeyError(
      keyErrorAdapter as never,
      "Hello",
      setMessages,
      { current: client } as never,
      pendingHistoryRef as never,
    );

    expect(setMessages).toHaveBeenCalledOnce();

    return {
      rendered: setMessages.mock.calls[0]?.[0] as { content?: string }[],
      stashed: pendingHistoryRef.current as { content?: string }[] | null,
    };
  }

  it("sets error message and stashes user message for retry/edit", () => {
    const { rendered, stashed } = showKeyError(null, null);

    expect(rendered).toHaveLength(2);
    expect(rendered[0]?.content).toBe("Hello");
    expect(stashed).toHaveLength(2);
    expect(stashed?.[0]?.content).toBe("Hello");
  });

  it("keeps the restored conversation the message was sent from", () => {
    // Regression: stashing the message alone truncated a restored
    // conversation to it, and the next send bootstrapped a client from that
    // truncation and saved it over the record.
    const restored = [{ role: "user", content: "earlier" }];
    const { rendered, stashed } = showKeyError(null, restored);

    expect(rendered.map((m) => m.content)).toStrictEqual([
      "earlier",
      "Hello",
      undefined,
    ]);
    expect(stashed?.map((m) => m.content)).toStrictEqual([
      "earlier",
      "Hello",
      undefined,
    ]);
    // The copy is what keeps the error off the restored array.
    expect(restored).toHaveLength(1);
  });

  it("renders against a live client's history without touching it", () => {
    // Switching to a keyless provider mid-conversation. The client owns the
    // history, so the stash stays empty and nothing was sent to grow it.
    const client = { chatHistory: [{ role: "user", content: "earlier" }] };
    const { rendered, stashed } = showKeyError(client, null);

    expect(rendered).toHaveLength(3);
    expect(rendered[0]?.content).toBe("earlier");
    expect(client.chatHistory).toHaveLength(1);
    expect(stashed).toBeNull();
  });
});
