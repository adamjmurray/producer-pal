// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import {
  type AppearanceSettings,
  useHasUnsavedChanges,
} from "#webui/hooks/settings/use-has-unsaved-changes";
import { DEFAULT_TURN_DETECTION } from "#webui/hooks/settings/turn-detection-helpers";
import { type UseSettingsReturn } from "#webui/types/settings";

const appearance: AppearanceSettings = {
  theme: "dark",
  showTimestamps: false,
  showHelpLinks: false,
  showTokenUsage: false,
};

function makeSettings(
  over: Partial<UseSettingsReturn> = {},
): UseSettingsReturn {
  return {
    provider: "openai",
    model: "gpt-realtime-2",
    apiKey: "k",
    smallModelMode: false,
    thinking: "Default",
    temperature: 1,
    enabledTools: {},
    realtimeVoice: "marin",
    voiceSpeed: 1,
    voiceVolume: 1,
    voiceLanguage: "en",
    turnDetection: DEFAULT_TURN_DETECTION,
    liveApiEnabledDirty: false,
    notationDirty: false,
    settingsLoaded: true,
    ...over,
  } as UseSettingsReturn;
}

/**
 * Renders the hook against a settings fixture plus an open/closed modal, and
 * hands back the live `result` alongside an `update` that re-renders with a new
 * settings fixture and open state. For tests that exercise the modal
 * opening/closing; see `renderWithOpenModal` for the always-open shape.
 *
 * @param initialSettings settings fixture for the first render
 * @param initialOpen whether the modal starts open
 * @returns the hook result handle and an update function taking settings and open state
 */
function renderWithModal(
  initialSettings: UseSettingsReturn,
  initialOpen: boolean,
) {
  const { result, rerender } = renderHook(
    ({ s, open }: { s: UseSettingsReturn; open: boolean }) =>
      useHasUnsavedChanges(s, appearance, open),
    { initialProps: { s: initialSettings, open: initialOpen } },
  );

  return {
    result,
    update(settings: UseSettingsReturn, open: boolean): void {
      rerender({ s: settings, open });
    },
  };
}

/**
 * Renders the hook with the modal open from the very first render, so `update`
 * only needs the next settings fixture. For tests where the open state never
 * changes and only the settings do.
 *
 * @param initialSettings settings fixture for the first render
 * @returns the hook result handle and an update function taking the next settings
 */
function renderWithOpenModal(initialSettings: UseSettingsReturn) {
  const { result, update } = renderWithModal(initialSettings, true);

  return {
    result,
    update(settings: UseSettingsReturn): void {
      update(settings, true);
    },
  };
}

describe("useHasUnsavedChanges", () => {
  it("detects a voice change after opening from a closed modal", () => {
    const { result, update } = renderWithModal(makeSettings(), false);

    update(makeSettings(), true);
    expect(result.current).toBe(false);

    update(makeSettings({ voiceVolume: 0.5 }), true);
    expect(result.current).toBe(true);
  });

  it("detects a lone voiceLanguage change (protected on dismiss)", () => {
    const { result, update } = renderWithModal(makeSettings(), false);

    update(makeSettings(), true);
    expect(result.current).toBe(false);

    // Changing only the voice-chat language must register as unsaved, so a
    // click-outside/Escape shakes-or-confirms instead of silently reverting it.
    update(makeSettings({ voiceLanguage: "es" }), true);
    expect(result.current).toBe(true);
  });

  it("detects a voice change when the modal is open from initial mount", () => {
    const { result, update } = renderWithOpenModal(makeSettings());

    update(makeSettings({ voiceVolume: 0.5 }));
    expect(result.current).toBe(true);
  });

  it("clears the baseline on close and recaptures on reopen", () => {
    const { result, update } = renderWithModal(makeSettings(), true);

    update(makeSettings({ voiceVolume: 0.5 }), true);
    expect(result.current).toBe(true);

    // Close (e.g. after Save): no unsaved state, baseline cleared.
    update(makeSettings({ voiceVolume: 0.5 }), false);
    expect(result.current).toBe(false);

    // Reopen: the now-current value becomes the fresh baseline.
    update(makeSettings({ voiceVolume: 0.5 }), true);
    expect(result.current).toBe(false);
  });

  it("detects a non-voice change too (the fix is not voice-specific)", () => {
    const { result, update } = renderWithOpenModal(makeSettings());

    update(makeSettings({ apiKey: "changed" }));
    expect(result.current).toBe(true);
  });

  it("does not flag the async apiKey decrypt as an unsaved change (#41)", () => {
    // Modal open from the first render with settings not yet loaded (apiKey
    // still blank pre-decrypt). The baseline must wait for settingsLoaded, so
    // the decrypted key landing isn't mistaken for a user edit.
    const { result, update } = renderWithOpenModal(
      makeSettings({ apiKey: "", settingsLoaded: false }),
    );

    // Not loaded yet → no baseline captured, so nothing reads as unsaved.
    expect(result.current).toBe(false);

    // Decrypt lands: apiKey populated AND settingsLoaded flips true. This is the
    // baseline, not a user edit → still no unsaved changes.
    update(makeSettings({ apiKey: "decrypted-key", settingsLoaded: true }));
    expect(result.current).toBe(false);

    // A subsequent real edit IS detected.
    update(makeSettings({ apiKey: "user-typed", settingsLoaded: true }));
    expect(result.current).toBe(true);
  });

  it("flags a notation change via its dirty flag (notation is not serialized)", () => {
    const { result, update } = renderWithOpenModal(makeSettings());

    // The notation value itself is omitted from the snapshot (the device can
    // change it out from under the modal); the dirty flag is what marks the
    // modal as having unsaved changes — mirroring liveApiEnabledDirty.
    update(makeSettings({ notationDirty: true }));
    expect(result.current).toBe(true);
  });
});
