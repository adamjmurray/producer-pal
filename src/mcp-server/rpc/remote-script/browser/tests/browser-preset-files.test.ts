// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { type PresetScope } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { findPresetFiles } from "../../../../live-library/query/preset-files.ts";
import { lookUpPresetFile } from "../browser-preset-files.ts";

vi.mock(import("../../../../live-library/query/preset-files.ts"), () => ({
  findPresetFiles: vi.fn(),
}));

const PRESET = {
  name: "Add Oxide.adv",
  path: "/Users/me/Factory Packs/Tape by Softube/Presets/Add Oxide.adv",
};

// Live lists a pack's Max audio effect under Audio Effects.
const TAPE: PresetScope = {
  type: "audio-effect",
  path: "Tape",
  device: "Tape",
};

/**
 * @param scope - The device the preset should be for
 * @returns What the lookup answers for "Add Oxide"
 */
async function lookUp(scope: PresetScope): ReturnType<typeof lookUpPresetFile> {
  return await lookUpPresetFile(
    "Add Oxide",
    "add oxide",
    scope,
    Date.now() + 60_000,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("lookUpPresetFile — a pack's Max device", () => {
  it("looks its presets up by the device's name and kind", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([PRESET]);

    expect(await lookUp(TAPE)).toStrictEqual({
      available: true,
      item: { type: "file", path: PRESET.path, name: PRESET.name },
    });
    expect(findPresetFiles).toHaveBeenCalledExactlyOnceWith({
      name: "add oxide",
      device: { name: "Tape", kind: "audiofx" },
    });
  });

  it("is null when the library has none for it", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([]);

    expect(await lookUp(TAPE)).toBeNull();
  });

  it("is null when the library can't be read", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue(null);

    expect(await lookUp(TAPE)).toBeNull();
  });
});

describe("lookUpPresetFile — a plug-in's presets", () => {
  it("stays with the browser, since a plug-in's presets can't be told apart", async () => {
    vi.mocked(findPresetFiles).mockResolvedValue([PRESET]);

    expect(
      await lookUp({ type: "plugin", path: "VST3/Pro-Q 4", device: "Pro-Q 4" }),
    ).toBeNull();
    expect(findPresetFiles).not.toHaveBeenCalled();
  });
});
