// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/preact";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
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
 * @param overrides.notation - In-modal notation value
 * @param overrides.notationDirty - Whether the notation dropdown was changed in-modal
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
    notation?: string;
    notationDirty?: boolean;
    viewingMode?: "chat" | "voice" | null;
    saveSettings?: ReturnType<typeof vi.fn>;
  } = {},
): {
  args: Parameters<typeof useSaveSettingsHandler>[0];
  saveSettings: ReturnType<typeof vi.fn>;
  postSmallModelMode: ReturnType<typeof vi.fn>;
  postLiveApiEnabled: ReturnType<typeof vi.fn>;
  postNotation: ReturnType<typeof vi.fn>;
  checkMcpConnection: ReturnType<typeof vi.fn>;
} {
  const saveSettings =
    overrides.saveSettings ?? vi.fn().mockResolvedValue(true);
  const postSmallModelMode = vi.fn();
  const postLiveApiEnabled = vi.fn().mockResolvedValue(undefined);
  const postNotation = vi.fn();
  const checkMcpConnection = vi.fn().mockResolvedValue(undefined);
  const args = {
    settings: {
      provider: overrides.provider ?? "openai",
      savedProvider: overrides.savedProvider ?? "openai",
      model: overrides.model ?? "gemini-1.5-flash",
      savedModel: overrides.savedModel ?? "gemini-1.5-flash",
      liveApiEnabled: overrides.liveApiEnabled ?? false,
      liveApiEnabledDirty: overrides.liveApiEnabledDirty ?? false,
      notation: overrides.notation ?? "barbeat",
      notationDirty: overrides.notationDirty ?? false,
      smallModelMode: false,
      saveSettings,
      // unused by the handler but required by the type
    } as unknown as Parameters<typeof useSaveSettingsHandler>[0]["settings"],
    display: {} as Parameters<typeof useSaveSettingsHandler>[0]["display"],
    remoteConfig: {
      postSmallModelMode,
      postLiveApiEnabled,
      postNotation,
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
    postNotation,
    checkMcpConnection,
  };
}

/**
 * Build the args for `overrides`, render the handler, and invoke it. Tests that
 * need to mutate `args` before rendering call makeArgs/renderHook directly.
 * @param overrides - Field overrides, as for makeArgs
 * @returns The makeArgs bundle, for asserting on the spies
 */
function renderSave(
  overrides: Parameters<typeof makeArgs>[0] = {},
): ReturnType<typeof makeArgs> {
  const bundle = makeArgs(overrides);
  const { result } = renderHook(() => useSaveSettingsHandler(bundle.args));

  result.current();

  return bundle;
}

describe("useSaveSettingsHandler", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("preserves the URL hash when the saved mode (voice/chat) does not change", async () => {
    window.location.hash = "conv-123";
    const { saveSettings } = renderSave({
      model: "gemini-2.5-pro",
      savedModel: "gemini-1.5-flash",
    });

    // Hash mutation now lives inside closeSettings's afterClose, which only
    // runs after saveSettings resolves (a failed persist must keep the modal
    // and hash untouched), so the assertion needs to wait for the microtask.
    await waitForHookState(() => expect(saveSettings).toHaveBeenCalled());
    expect(window.location.hash).toBe("#conv-123");
  });

  it("clears the URL hash when saving flips chat → voice", async () => {
    window.location.hash = "chat-conv-1";
    renderSave({ model: "gpt-realtime-2", savedModel: "gemini-1.5-flash" });

    await waitForHookState(() => expect(window.location.hash).toBe(""));
  });

  it("clears the URL hash when saving flips voice → chat", async () => {
    window.location.hash = "voice-conv-1";

    renderSave({ model: "gemini-1.5-flash", savedModel: "gpt-realtime-2" });

    await waitForHookState(() => expect(window.location.hash).toBe(""));
  });

  it("preserves the URL hash on a mode-flip save when a foreign record is pinned", async () => {
    // A voice record is being viewed (viewingMode="voice") while the saved
    // model is a chat model; the save flips the saved mode to voice. The screen
    // won't remount, so wiping the hash here would lose the displayed record.
    window.location.hash = "voice-conv-1";
    const { saveSettings } = renderSave({
      model: "gpt-realtime-2",
      savedModel: "gemini-1.5-flash",
      viewingMode: "voice",
    });

    await waitForHookState(() => expect(saveSettings).toHaveBeenCalled());
    expect(window.location.hash).toBe("#voice-conv-1");
  });

  it("posts liveApiEnabled then re-lists MCP tools when the toggle changed", async () => {
    const { postLiveApiEnabled, checkMcpConnection } = renderSave({
      liveApiEnabled: true,
      liveApiEnabledDirty: true,
    });

    // The handler chains postLiveApiEnabled inside saveSettings().then(...), so
    // it lands a microtask later than the synchronous-fire pattern this test
    // used previously.
    await waitForHookState(() =>
      expect(postLiveApiEnabled).toHaveBeenCalledWith(true),
    );
    // checkMcpConnection runs only after the POST resolves (the server exposes
    // ppal-live-api based on the flag, so listTools must follow the POST).
    await waitForHookState(() =>
      expect(checkMcpConnection).toHaveBeenCalledTimes(1),
    );
  });

  it("does not post liveApiEnabled when the toggle was untouched", () => {
    const { postLiveApiEnabled, checkMcpConnection } = renderSave({
      liveApiEnabledDirty: false,
    });

    expect(postLiveApiEnabled).not.toHaveBeenCalled();
    expect(checkMcpConnection).not.toHaveBeenCalled();
  });

  it("posts notation when the dropdown changed (no MCP re-list)", async () => {
    const { postNotation, checkMcpConnection } = renderSave({
      notation: "midi-json",
      notationDirty: true,
    });

    await waitForHookState(() =>
      expect(postNotation).toHaveBeenCalledWith("midi-json"),
    );
    // Notation doesn't change the tool list, so no reconnect is triggered.
    expect(checkMcpConnection).not.toHaveBeenCalled();
  });

  it("does not post notation when the dropdown was untouched", async () => {
    const { postNotation, saveSettings } = renderSave({
      notationDirty: false,
    });

    await waitForHookState(() => expect(saveSettings).toHaveBeenCalled());
    expect(postNotation).not.toHaveBeenCalled();
  });

  it("awaits saveSettings before firing the post-save RPCs", async () => {
    // Encryption + localStorage writes are async; the RPCs must wait so the
    // server sees a fully persisted state (and the modal-close "Save" promise
    // really means saved).
    let resolveSave: (value: boolean) => void = () => {};
    const savePromise = new Promise<boolean>((resolve) => {
      resolveSave = resolve;
    });
    const saveSettings = vi.fn().mockReturnValue(savePromise);
    const { postSmallModelMode, postLiveApiEnabled, checkMcpConnection } =
      renderSave({
        liveApiEnabled: true,
        liveApiEnabledDirty: true,
        saveSettings,
      });

    // saveSettings is called immediately but its promise is in flight; the
    // downstream RPCs must NOT have fired yet.
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(postSmallModelMode).not.toHaveBeenCalled();
    expect(postLiveApiEnabled).not.toHaveBeenCalled();

    resolveSave(true);
    await waitForHookState(() => {
      expect(postSmallModelMode).toHaveBeenCalledTimes(1);
      expect(postLiveApiEnabled).toHaveBeenCalledWith(true);
    });
    await waitForHookState(() =>
      expect(checkMcpConnection).toHaveBeenCalledTimes(1),
    );
  });

  it("skips closeSettings + post-save RPCs when saveSettings reports failure", async () => {
    // A failed persist (returns false) must keep the modal open and not fire
    // any post-save side effects — those would route the app off settings
    // that aren't actually saved (the silent-data-loss bug this fix targets).
    const closeSettings = vi.fn((afterClose: () => void) => afterClose());
    const saveSettings = vi.fn().mockResolvedValue(false);
    const { args, postSmallModelMode, postLiveApiEnabled, checkMcpConnection } =
      makeArgs({
        liveApiEnabled: true,
        liveApiEnabledDirty: true,
        saveSettings,
      });

    args.closeSettings = closeSettings;
    window.location.hash = "chat-conv-1";
    args.settings.model = "gpt-realtime-2";
    args.settings.savedModel = "gemini-1.5-flash";

    const { result } = renderHook(() => useSaveSettingsHandler(args));

    result.current();

    await waitForHookState(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    // Give any stray microtasks a chance to land before asserting "did not".
    await Promise.resolve();

    expect(closeSettings).not.toHaveBeenCalled();
    expect(postSmallModelMode).not.toHaveBeenCalled();
    expect(postLiveApiEnabled).not.toHaveBeenCalled();
    expect(checkMcpConnection).not.toHaveBeenCalled();
    // Hash mode-flip clearing lives in closeSettings's afterClose, so a failed
    // save must also leave the hash intact.
    expect(window.location.hash).toBe("#chat-conv-1");
  });
});
