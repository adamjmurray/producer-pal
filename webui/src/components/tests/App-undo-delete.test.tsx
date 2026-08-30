// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, render } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./App-mocks-test-helpers";
import { type ModeAppProps } from "#webui/components/mode-context";
import { type UndoDeleteReturn } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import { mockSettingsHook, setupDefaultMocks } from "./App-test-helpers";
import { App } from "#webui/components/App";

// The two mode bodies, replaced by stubs that only record the undo stack App
// handed them. Only one is mounted at a time, which is the whole point: a stack
// owned by either would go down with it on a mode switch.
const seen: Record<"chat" | "voice", UndoDeleteReturn | null> = {
  chat: null,
  voice: null,
};

vi.mock(import("#webui/components/ChatApp"), () => ({
  ChatApp: (props: ModeAppProps) => {
    seen.chat = props.undoDelete;

    return <div />;
  },
}));
vi.mock(import("#webui/components/voice/VoiceApp"), () => ({
  VoiceApp: (props: ModeAppProps) => {
    seen.voice = props.undoDelete;

    return <div />;
  },
}));

/** Point the settings mock at a chat or a realtime (voice) model. */
function setMode(mode: "chat" | "voice"): void {
  (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
    ...mockSettingsHook,
    savedProvider: mode === "voice" ? "openai" : "gemini",
    savedModel: mode === "voice" ? "gpt-realtime-2.1" : "gemini-1.5-flash",
  });
}

describe("App undo-delete stack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    seen.chat = null;
    seen.voice = null;
  });

  it("keeps a pending undo across a chat → voice switch", async () => {
    setMode("chat");
    const { rerender } = render(<App />);

    await act(() => {
      seen.chat!.pushDeleted(createTestRecord({ title: "Still here" }));
    });
    expect(seen.chat?.undoNotification?.message).toBe("Deleted “Still here”");

    setMode("voice");
    rerender(<App />);

    expect(seen.voice?.undoNotification?.message).toBe("Deleted “Still here”");
  });
});
