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
    showThoughts: true,
    enabledTools: {},
    realtimeVoice: "marin",
    voiceSpeed: 1,
    voiceVolume: 1,
    turnDetection: DEFAULT_TURN_DETECTION,
    liveApiEnabledDirty: false,
    ...over,
  } as UseSettingsReturn;
}

describe("useHasUnsavedChanges", () => {
  it("detects a voice change after opening from a closed modal", () => {
    const { result, rerender } = renderHook(
      ({ s, open }: { s: UseSettingsReturn; open: boolean }) =>
        useHasUnsavedChanges(s, appearance, open),
      { initialProps: { s: makeSettings(), open: false } },
    );

    rerender({ s: makeSettings(), open: true });
    expect(result.current).toBe(false);

    rerender({ s: makeSettings({ voiceVolume: 0.5 }), open: true });
    expect(result.current).toBe(true);
  });

  it("detects a voice change when the modal is open from initial mount", () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: UseSettingsReturn }) =>
        useHasUnsavedChanges(s, appearance, true),
      { initialProps: { s: makeSettings() } },
    );

    rerender({ s: makeSettings({ voiceVolume: 0.5 }) });
    expect(result.current).toBe(true);
  });

  it("clears the baseline on close and recaptures on reopen", () => {
    const { result, rerender } = renderHook(
      ({ s, open }: { s: UseSettingsReturn; open: boolean }) =>
        useHasUnsavedChanges(s, appearance, open),
      { initialProps: { s: makeSettings(), open: true } },
    );

    rerender({ s: makeSettings({ voiceVolume: 0.5 }), open: true });
    expect(result.current).toBe(true);

    // Close (e.g. after Save): no unsaved state, baseline cleared.
    rerender({ s: makeSettings({ voiceVolume: 0.5 }), open: false });
    expect(result.current).toBe(false);

    // Reopen: the now-current value becomes the fresh baseline.
    rerender({ s: makeSettings({ voiceVolume: 0.5 }), open: true });
    expect(result.current).toBe(false);
  });

  it("detects a non-voice change too (the fix is not voice-specific)", () => {
    const { result, rerender } = renderHook(
      ({ s }: { s: UseSettingsReturn }) =>
        useHasUnsavedChanges(s, appearance, true),
      { initialProps: { s: makeSettings() } },
    );

    rerender({ s: makeSettings({ apiKey: "changed" }) });
    expect(result.current).toBe(true);
  });
});
