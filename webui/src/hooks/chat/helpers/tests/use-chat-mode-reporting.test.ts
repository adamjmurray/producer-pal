// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { type ModeContext } from "#webui/components/mode-context";
import { useChatModeReporting } from "#webui/hooks/chat/helpers/use-chat-mode-reporting";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { type UseSettingsReturn } from "#webui/types/settings";

describe("useChatModeReporting", () => {
  it("forwards delete handlers through the mode context", () => {
    const handleDeleteAll = vi.fn();
    const handleDeleteUnbookmarked = vi.fn();
    let captured: ModeContext | null = null;

    const setModeContext = (ctx: ModeContext) => {
      captured = ctx;
    };

    renderHook(() =>
      useChatModeReporting({
        chat: {
          activeModel: null,
          activeProvider: null,
          activeSmallModelMode: null,
          activeNotation: null,
        },
        settings: {
          model: "gemini-1.5-flash",
          provider: "google",
          smallModelMode: false,
        } as unknown as UseSettingsReturn,
        display: {
          showHelpLinks: true,
        } as unknown as PreferencesSettings,
        enabledToolsCount: 3,
        totalToolsCount: 5,
        handleDeleteAll,
        handleDeleteUnbookmarked,
        setModeContext,
      }),
    );

    expect(captured).not.toBeNull();
    (captured as unknown as ModeContext).onDeleteAllConversations();
    expect(handleDeleteAll).toHaveBeenCalledTimes(1);

    (captured as unknown as ModeContext).onDeleteUnbookmarkedConversations();
    expect(handleDeleteUnbookmarked).toHaveBeenCalledTimes(1);
  });
});
