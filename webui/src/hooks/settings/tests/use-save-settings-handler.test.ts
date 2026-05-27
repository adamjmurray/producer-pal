// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from "@testing-library/preact";
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
 * @param overrides.liveApiEnabled - In-modal Live API toggle value
 * @param overrides.liveApiEnabledDirty - Whether the toggle was changed in-modal
 * @param overrides.viewingMode - Foreign-record view override (defaults to null)
 * @param overrides.saveSettings - Override the saveSettings spy (useful for staging an unresolved Promise)
 * @returns Args plus the inner spies used to assert
 */
function makeArgs(
  overrides: {
    model?: string;
    savedModel?: string;
    provider?: string;
    savedProvider?: string;
    liveApiEnabled?: boolean;
    liveApiEnabledDirty?: boolean;
    viewingMode?: "chat" | "voice" | null;
    saveSettings?: ReturnType<typeof vi.fn>;
  } = {},
): {
  args: Parameters<typeof useSaveSettingsHandler>[0];
  saveSettings: ReturnType<typeof vi.fn>;
  postSmallModelMode: ReturnType<typeof vi.fn>;
  postLiveApiEnabled: ReturnType<typeof vi.fn>;
  checkMcpConnection: ReturnType<typeof vi.fn>;
} {
  const saveSettings =
    overrides.saveSettings ?? vi.fn().mockResolvedValue(undefined);
  const postSmallModelMode = vi.fn();
  const postLiveApiEnabled = vi.fn().mockResolvedValue(undefined);
  const checkMcpConnection = vi.fn().mockResolvedValue(undefined);
  const args = {
    settings: {
      provider: overrides.provider ?? "openai",
      savedProvider: overrides.savedProvider ?? "openai",
      model: overrides.model ?? "gemini-1.5-flash",
      savedModel: overrides.savedModel ?? "gemini-1.5-flash",
      liveApiEnabled: overrides.liveApiEnabled ?? false,
      liveApiEnabledDirty: overrides.liveApiEnabledDirty ?? false,
      smallModelMode: false,
      saveSettings,
      // unused by the handler but required by the type
    } as unknown as Parameters<typeof useSaveSettingsHandler>[0]["settings"],
    display: {} as Parameters<typeof useSaveSettingsHandler>[0]["display"],
    remoteConfig: {
      postSmallModelMode,
      postLiveApiEnabled,
    } as unknown as Parameters<
      typeof useSaveSettingsHandler
    >[0]["remoteConfig"],
    checkMcpConnection,
    closeSettings: ((afterClose: () => void) => afterClose()) as Parameters<
      typeof useSaveSettingsHandler
    >[0]["closeSettings"],
    viewingMode: overrides.viewingMode ?? null,
  };

  return {
    args,
    saveSettings,
    postSmallModelMode,
    postLiveApiEnabled,
    checkMcpConnection,
  };
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

  it("preserves the URL hash on a mode-flip save when a foreign record is pinned", () => {
    // A voice record is being viewed (viewingMode="voice") while the saved
    // model is a chat model; the save flips the saved mode to voice. The screen
    // won't remount, so wiping the hash here would lose the displayed record.
    window.location.hash = "voice-conv-1";
    const { args } = makeArgs({
      model: "gpt-realtime-2",
      savedModel: "gemini-1.5-flash",
      viewingMode: "voice",
    });
    const { result } = renderHook(() => useSaveSettingsHandler(args));

    result.current();

    expect(window.location.hash).toBe("#voice-conv-1");
  });

  it("posts liveApiEnabled then re-lists MCP tools when the toggle changed", async () => {
    const { args, postLiveApiEnabled, checkMcpConnection } = makeArgs({
      liveApiEnabled: true,
      liveApiEnabledDirty: true,
    });
    const { result } = renderHook(() => useSaveSettingsHandler(args));

    result.current();

    // The handler chains postLiveApiEnabled inside saveSettings().then(...), so
    // it lands a microtask later than the synchronous-fire pattern this test
    // used pre-AJM-418.
    await waitFor(() => expect(postLiveApiEnabled).toHaveBeenCalledWith(true));
    // checkMcpConnection runs only after the POST resolves (the server exposes
    // ppal-live-api based on the flag, so listTools must follow the POST).
    await waitFor(() => expect(checkMcpConnection).toHaveBeenCalledTimes(1));
  });

  it("does not post liveApiEnabled when the toggle was untouched", () => {
    const { args, postLiveApiEnabled, checkMcpConnection } = makeArgs({
      liveApiEnabledDirty: false,
    });
    const { result } = renderHook(() => useSaveSettingsHandler(args));

    result.current();

    expect(postLiveApiEnabled).not.toHaveBeenCalled();
    expect(checkMcpConnection).not.toHaveBeenCalled();
  });

  it("awaits saveSettings before firing the post-save RPCs", async () => {
    // Encryption + localStorage writes are async; the RPCs must wait so the
    // server sees a fully persisted state (and the modal-close "Save" promise
    // really means saved).
    let resolveSave: () => void = () => {};
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const saveSettings = vi.fn().mockReturnValue(savePromise);
    const { args, postSmallModelMode, postLiveApiEnabled, checkMcpConnection } =
      makeArgs({
        liveApiEnabled: true,
        liveApiEnabledDirty: true,
        saveSettings,
      });
    const { result } = renderHook(() => useSaveSettingsHandler(args));

    result.current();

    // saveSettings is called immediately but its promise is in flight; the
    // downstream RPCs must NOT have fired yet.
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(postSmallModelMode).not.toHaveBeenCalled();
    expect(postLiveApiEnabled).not.toHaveBeenCalled();

    resolveSave();
    await waitFor(() => {
      expect(postSmallModelMode).toHaveBeenCalledTimes(1);
      expect(postLiveApiEnabled).toHaveBeenCalledWith(true);
    });
    await waitFor(() => expect(checkMcpConnection).toHaveBeenCalledTimes(1));
  });
});
