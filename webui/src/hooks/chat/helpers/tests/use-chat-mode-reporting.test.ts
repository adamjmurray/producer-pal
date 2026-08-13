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
          activeEnabledTools: null,
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
        defaultToolsCount: 5,
        enabledToolsDiverge: false,
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

  it("reports the live conversation's notation and toolset, not just nulls", () => {
    // These two are what LockedSettingsNotice diffs against the current settings
    // to warn that an edit won't reach the running conversation. Asserted with
    // real values because null is the one case where every comparison in that
    // notice short-circuits.
    const enabledTools = { "ppal-create-clip": true, "ppal-delete": false };
    let captured: ModeContext | null = null;

    renderHook(() =>
      useChatModeReporting({
        chat: {
          activeModel: "claude-opus-4",
          activeProvider: "anthropic",
          activeSmallModelMode: true,
          activeNotation: "stark",
          activeEnabledTools: enabledTools,
        },
        settings: {
          model: "gemini-1.5-flash",
          provider: "google",
          smallModelMode: false,
        } as unknown as UseSettingsReturn,
        display: { showHelpLinks: true } as unknown as PreferencesSettings,
        enabledToolsCount: 3,
        totalToolsCount: 5,
        defaultToolsCount: 5,
        enabledToolsDiverge: false,
        handleDeleteAll: vi.fn(),
        handleDeleteUnbookmarked: vi.fn(),
        setModeContext: (ctx: ModeContext) => {
          captured = ctx;
        },
      }),
    );

    const lock = (captured as unknown as ModeContext).conversationLock;

    expect(lock.activeNotation).toBe("stark");
    expect(lock.activeEnabledTools).toStrictEqual(enabledTools);
    expect(lock.activeSmallModelMode).toBe(true);
    expect(lock.activeModel).toBe("claude-opus-4");
    expect(lock.activeProvider).toBe("anthropic");
    // Chat mode never locks a voice — that field belongs to voice mode.
    expect((captured as unknown as ModeContext).activeVoice).toBeNull();
  });
});
