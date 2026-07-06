// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */

import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { useChat } from "#webui/hooks/chat/use-chat";
import {
  createDefaultProps,
  createMockAdapter,
  lockedSettings,
} from "./use-chat-test-helpers";

const mockAdapter = createMockAdapter();
const defaultProps = createDefaultProps(mockAdapter);

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
