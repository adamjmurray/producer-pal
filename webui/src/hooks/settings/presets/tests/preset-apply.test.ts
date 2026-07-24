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

    const { result } = renderHook(() =>
      useApplyPreset(setters, setProvider, setSmallModelMode),
    );

    const preset: ChatPreset = {
      id: "1",
      name: "P",
      provider: "openai",
      model: "gpt-x",
      thinking: "Max",
      temperature: 0.5,
      showThoughts: false,
      smallModelMode: true,
    };

    await act(() => result.current(preset));

    // Only the preset's provider slice is written; others untouched.
    expect(setters.openai).toHaveBeenCalledTimes(1);
    expect(setters.anthropic).not.toHaveBeenCalled();

    // The functional update swaps the model params but preserves apiKey/baseUrl.
    const prev: ProviderSettings = {
      apiKey: "KEEP",
      baseUrl: "http://keep",
      model: "old",
      thinking: "Default",
      temperature: 1,
      showThoughts: true,
    };

    expect(captured.openai?.(prev)).toStrictEqual({
      apiKey: "KEEP",
      baseUrl: "http://keep",
      model: "gpt-x",
      thinking: "Max",
      temperature: 0.5,
      showThoughts: false,
    });

    expect(setProvider).toHaveBeenCalledWith("openai");
    expect(setSmallModelMode).toHaveBeenCalledWith(true);
  });
});
