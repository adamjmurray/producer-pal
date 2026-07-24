// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { presetToExtraParams } from "#webui/hooks/settings/presets/preset-extra-params";
import { type ChatPreset } from "#webui/types/settings";

describe("presetToExtraParams", () => {
  it("maps provider and resolves key+baseUrl live", () => {
    const preset: ChatPreset = {
      id: "1",
      name: "Cheap worker",
      provider: "ollama",
      model: "llama3",
      thinking: "Off",
      smallModelMode: true,
    };
    const getProviderConnection = vi.fn(() => ({
      apiKey: "resolved-key",
      baseUrl: "http://localhost:11434",
    }));

    const params = presetToExtraParams(preset, getProviderConnection);

    expect(getProviderConnection).toHaveBeenCalledWith("ollama");
    // model/thinking are positional buildConfig args, not extraParams
    expect(params).toStrictEqual({
      provider: "ollama",
      apiKey: "resolved-key",
      baseUrl: "http://localhost:11434",
    });
  });
});
