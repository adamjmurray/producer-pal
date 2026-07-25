// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useApplyPreset } from "#webui/hooks/settings/presets/preset-apply";
import {
  type ProviderSettings,
  type ProviderStateSetters,
} from "#webui/hooks/settings/settings-helpers";
import { type ChatPreset, type Provider } from "#webui/types/settings";

const ALL_PROVIDERS: Provider[] = [
  "anthropic",
  "gemini",
  "openai",
  "mistral",
  "openrouter",
  "lmstudio",
  "ollama",
  "custom",
];

describe("useApplyPreset", () => {
  it("writes preset fields into the preset's own slice and switches provider", async () => {
    const captured: Partial<
      Record<Provider, (prev: ProviderSettings) => ProviderSettings>
    > = {};
    const setters = {} as ProviderStateSetters;

    for (const p of ALL_PROVIDERS) {
      setters[p] = vi.fn(
        (update: (prev: ProviderSettings) => ProviderSettings) => {
          captured[p] = update;
        },
      );
    }

    const setProvider = vi.fn();
    const setSmallModelMode = vi.fn();
    const setEnabledTools = vi.fn();
    const setNotation = vi.fn();

    const { result } = renderHook(() =>
      useApplyPreset(
        setters,
        setProvider,
        setSmallModelMode,
        setEnabledTools,
        setNotation,
      ),
    );

    const preset: ChatPreset = {
      id: "1",
      name: "P",
      provider: "openai",
      model: "gpt-x",
      thinking: "Max",
      smallModelMode: true,
      enabledTools: { "ppal-delete": false },
      notation: "stark",
    };

    await act(() => result.current(preset));

    // Only the preset's provider slice is written; others untouched.
    expect(setters.openai).toHaveBeenCalledTimes(1);
    expect(setters.anthropic).not.toHaveBeenCalled();

    // The functional update swaps model+thinking but preserves everything else
    // in the slice (apiKey/baseUrl).
    const prev: ProviderSettings = {
      apiKey: "KEEP",
      baseUrl: "http://keep",
      model: "old",
      thinking: "Default",
    };

    expect(captured.openai?.(prev)).toStrictEqual({
      apiKey: "KEEP",
      baseUrl: "http://keep",
      model: "gpt-x",
      thinking: "Max",
    });

    expect(setProvider).toHaveBeenCalledWith("openai");
    expect(setSmallModelMode).toHaveBeenCalledWith(true);
    // The captured toolset is applied verbatim (as a fresh copy).
    expect(setEnabledTools).toHaveBeenCalledWith({ "ppal-delete": false });
    expect(setNotation).toHaveBeenCalledWith("stark");
  });

  it("leaves the toolset and notation untouched for a legacy preset", async () => {
    const setters = {} as ProviderStateSetters;

    for (const p of ALL_PROVIDERS) setters[p] = vi.fn();

    const setEnabledTools = vi.fn();
    const setNotation = vi.fn();

    const { result } = renderHook(() =>
      useApplyPreset(setters, vi.fn(), vi.fn(), setEnabledTools, setNotation),
    );

    const legacy: ChatPreset = {
      id: "1",
      name: "Legacy",
      provider: "anthropic",
      model: "claude",
      thinking: "Default",
      smallModelMode: false,
    };

    await act(() => result.current(legacy));

    // Neither captured => "inherit": the current values stay as-is. Not calling
    // setNotation also keeps its dirty flag clear, so Save posts no /config
    // write for a preset that never had an opinion about notation.
    expect(setEnabledTools).not.toHaveBeenCalled();
    expect(setNotation).not.toHaveBeenCalled();
  });
});
