// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  presetToExtraParams,
  resolveSubagentPreset,
} from "#webui/hooks/settings/presets/preset-extra-params";
import { type ChatPreset } from "#webui/types/settings";

const cheapWorker: ChatPreset = {
  id: "1",
  name: "Cheap worker",
  provider: "ollama",
  model: "llama3",
  thinking: "Off",
  smallModelMode: true,
};

describe("presetToExtraParams", () => {
  it("maps provider and resolves key+baseUrl live", () => {
    const getProviderConnection = vi.fn(() => ({
      apiKey: "resolved-key",
      baseUrl: "http://localhost:11434",
    }));

    const params = presetToExtraParams(cheapWorker, getProviderConnection);

    expect(getProviderConnection).toHaveBeenCalledWith("ollama");
    // model/thinking are positional buildConfig args, not extraParams
    expect(params).toStrictEqual({
      provider: "ollama",
      apiKey: "resolved-key",
      baseUrl: "http://localhost:11434",
    });
  });
});

describe("resolveSubagentPreset", () => {
  const getProviderConnection = vi.fn(() => ({
    apiKey: "resolved-key",
    baseUrl: "http://localhost:11434",
  }));

  it("returns the full worker bundle for a matching preset id", () => {
    const resolved = resolveSubagentPreset(
      "1",
      [cheapWorker],
      getProviderConnection,
    );

    expect(resolved).toStrictEqual({
      provider: "ollama",
      apiKey: "resolved-key",
      baseUrl: "http://localhost:11434",
      model: "llama3",
      thinking: "Off",
      smallModelMode: true,
    });
  });

  it("returns undefined for the inherit sentinel (null / empty)", () => {
    expect(
      resolveSubagentPreset(null, [cheapWorker], getProviderConnection),
    ).toBeUndefined();
    expect(
      resolveSubagentPreset("", [cheapWorker], getProviderConnection),
    ).toBeUndefined();
  });

  it("degrades to inherit for a dangling id (preset since deleted)", () => {
    expect(
      resolveSubagentPreset("gone", [cheapWorker], getProviderConnection),
    ).toBeUndefined();
  });
});
