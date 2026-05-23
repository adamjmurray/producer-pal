// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSaveSettingsHandler } from "#webui/hooks/settings/use-save-settings-handler";

vi.mock(import("#webui/hooks/use-preferences-settings"), () => ({
  savePreferencesSettings: vi.fn(),
}));

/**
 * Build a minimal settings-handler arg bundle. Pass `model` and `savedModel`
 * to control whether the save flips voice ↔ chat mode. Provider defaults to
 * `openai` so realtime model ids are recognized for the mode-change check.
 * @param overrides - Field overrides
 * @param overrides.model - In-modal model value (defaults to a chat model)
 * @param overrides.savedModel - Persisted model value (defaults to a chat model)
 * @param overrides.provider - In-modal provider (defaults to openai)
 * @param overrides.savedProvider - Persisted provider (defaults to openai)
 * @returns Args plus the inner spies used to assert
 */
function makeArgs(
  overrides: {
    model?: string;
    savedModel?: string;
    provider?: string;
    savedProvider?: string;
  } = {},
): {
  args: Parameters<typeof useSaveSettingsHandler>[0];
  saveSettings: ReturnType<typeof vi.fn>;
} {
  const saveSettings = vi.fn();
  const args = {
    settings: {
      provider: overrides.provider ?? "openai",
      savedProvider: overrides.savedProvider ?? "openai",
      model: overrides.model ?? "gemini-1.5-flash",
      savedModel: overrides.savedModel ?? "gemini-1.5-flash",
      liveApiEnabled: false,
      liveApiEnabledDirty: false,
      smallModelMode: false,
      saveSettings,
      // unused by the handler but required by the type
    } as unknown as Parameters<typeof useSaveSettingsHandler>[0]["settings"],
    display: {} as Parameters<typeof useSaveSettingsHandler>[0]["display"],
    remoteConfig: {
      postSmallModelMode: vi.fn(),
      postLiveApiEnabled: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<
      typeof useSaveSettingsHandler
    >[0]["remoteConfig"],
    checkMcpConnection: vi.fn().mockResolvedValue(undefined),
    closeSettings: ((afterClose: () => void) => afterClose()) as Parameters<
      typeof useSaveSettingsHandler
    >[0]["closeSettings"],
  };

  return { args, saveSettings };
}

describe("useSaveSettingsHandler", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("preserves the URL hash when the saved mode (voice/chat) does not change", () => {
    window.location.hash = "conv-123";
    const { args, saveSettings } = makeArgs({
      model: "gemini-2.5-pro",
      savedModel: "gemini-1.5-flash",
    });
    const { result } = renderHook(() => useSaveSettingsHandler(args));

    result.current();

    expect(saveSettings).toHaveBeenCalled();
    expect(window.location.hash).toBe("#conv-123");
  });

  it("clears the URL hash when saving flips chat → voice", () => {
    window.location.hash = "chat-conv-1";
    const { args } = makeArgs({
      model: "gpt-realtime-2",
      savedModel: "gemini-1.5-flash",
    });
    const { result } = renderHook(() => useSaveSettingsHandler(args));

    result.current();

    expect(window.location.hash).toBe("");
  });

  it("clears the URL hash when saving flips voice → chat", () => {
    window.location.hash = "voice-conv-1";
    const { args } = makeArgs({
      model: "gemini-1.5-flash",
      savedModel: "gpt-realtime-2",
    });
    const { result } = renderHook(() => useSaveSettingsHandler(args));

    result.current();

    expect(window.location.hash).toBe("");
  });
});
