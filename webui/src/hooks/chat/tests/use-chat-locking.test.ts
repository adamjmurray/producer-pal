// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */

import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useChat } from "#webui/hooks/chat/use-chat";
import {
  createDefaultProps,
  createMockAdapter,
  lockedSettings,
} from "./helpers/use-chat-test-helpers";

const mockAdapter = createMockAdapter();
const defaultProps = createDefaultProps(mockAdapter);
// The chat's own notation, which a brand-new conversation locks and every
// request then carries as its header.
const withNotation = { ...defaultProps, extraParams: { notation: "barbeat" } };

/**
 * The `lockedNotation` carried by the init the adapter last built a config from.
 * @returns The locked notation, or undefined when the init carried no key
 */
function lastLockedNotation(): unknown {
  return vi.mocked(mockAdapter.buildConfig).mock.lastCall?.[4]?.lockedNotation;
}

describe("useChat system instruction locking", () => {
  it("continues a restored conversation with its locked system instruction", async () => {
    // The conversation was saved with a specific system prompt. Continuing it
    // must send that locked prompt (via extraParams.lockedSystemInstruction),
    // not re-resolve the current global override.
    const { result } = renderHook(() => useChat(defaultProps));

    await act(async () => {
      result.current.restoreChatHistory(
        [{ role: "user", content: "hi" }],
        lockedSettings({
          systemInstruction: "Locked prompt from when the chat started.",
        }),
      );
    });

    await act(async () => {
      await result.current.handleSend("continue");
    });

    expect(mockAdapter.buildConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        lockedSystemInstruction: "Locked prompt from when the chat started.",
      }),
    );
    expect(result.current.activeSystemInstruction).toBe(
      "Locked prompt from when the chat started.",
    );
  });
});

describe("useChat notation locking", () => {
  it("locks the current notation when a new conversation starts", async () => {
    const { result } = renderHook(() => useChat(withNotation));

    await act(async () => {
      await result.current.handleSend("hello");
    });

    expect(lastLockedNotation()).toBeNull();
    expect(result.current.activeNotation).toBe("barbeat");
  });

  it("continues a restored conversation in the notation it was written in", async () => {
    // The turns already in this transcript are stark, so the next request has to
    // keep saying stark — even though the device (and this UI) now say bar|beat.
    // Otherwise the model is taught one notation and handed notes in another.
    const { result } = renderHook(() => useChat(withNotation));

    await act(async () => {
      result.current.restoreChatHistory(
        [{ role: "user", content: "hi" }],
        lockedSettings({ notation: "stark" }),
      );
    });

    expect(result.current.activeNotation).toBe("stark");

    await act(async () => {
      await result.current.handleSend("continue");
    });

    expect(lastLockedNotation()).toBe("stark");
    expect(result.current.activeNotation).toBe("stark");
  });

  it("locks nothing for a caller with no notation of its own", async () => {
    // No notation to send, so the request carries no header and falls through to
    // the device global — the contract external MCP clients already have.
    const { result } = renderHook(() => useChat(defaultProps));

    await act(async () => {
      await result.current.handleSend("hello");
    });

    expect(result.current.activeNotation).toBeNull();
  });
});
