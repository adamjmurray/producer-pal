// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createPresetId,
  enabledToolsEqual,
  loadPresets,
  PRESETS_STORAGE_KEY,
  presetMatchesFields,
  savePresets,
} from "#webui/hooks/settings/presets/preset-storage";
import { type ChatPreset, type PresetFields } from "#webui/types/settings";

function makePreset(over?: Partial<ChatPreset>): ChatPreset {
  return {
    id: "id-1",
    name: "Preset",
    provider: "anthropic",
    model: "claude",
    thinking: "Default",
    smallModelMode: false,
    ...over,
  };
}

describe("preset-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns [] when no presets are stored", () => {
    expect(loadPresets()).toStrictEqual([]);
  });

  it("round-trips saved presets through localStorage", () => {
    const list = [makePreset(), makePreset({ id: "id-2", name: "Other" })];

    savePresets(list);

    expect(loadPresets()).toStrictEqual(list);
    expect(localStorage.getItem(PRESETS_STORAGE_KEY)).toBe(
      JSON.stringify(list),
    );
  });

  it("returns [] for non-JSON storage", () => {
    localStorage.setItem(PRESETS_STORAGE_KEY, "not json");

    expect(loadPresets()).toStrictEqual([]);
  });

  it("returns [] when the stored value is not an array", () => {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify({ nope: true }));

    expect(loadPresets()).toStrictEqual([]);
  });

  it("drops malformed entries but keeps valid ones", () => {
    const good = makePreset();
    const stored = [
      good,
      { id: "x" }, // missing fields
      makePreset({ id: "y", provider: "bogus" as ChatPreset["provider"] }),
      { ...makePreset({ id: "z" }), smallModelMode: "true" }, // wrong type
      { ...makePreset({ id: "d" }), description: 42 }, // wrong description type
      { ...makePreset({ id: "t" }), enabledTools: { "ppal-delete": "no" } }, // non-boolean
      { ...makePreset({ id: "a" }), enabledTools: ["ppal-delete"] }, // not a map
      { ...makePreset({ id: "n" }), notation: "tablature" }, // not a notation
      null,
      "string",
    ];

    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(stored));

    expect(loadPresets()).toStrictEqual([good]);
  });

  it("keeps the optional description, enabledTools, and notation fields", () => {
    const withExtras = makePreset({
      description: "cheap worker",
      enabledTools: { "ppal-delete": false, "ppal-read-clip": true },
      notation: "stark",
    });

    savePresets([withExtras]);

    expect(loadPresets()).toStrictEqual([withExtras]);
  });

  it("generates unique ids", () => {
    const a = createPresetId();
    const b = createPresetId();

    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  describe("presetMatchesFields", () => {
    const fields: PresetFields = {
      provider: "anthropic",
      model: "claude",
      thinking: "Default",
      smallModelMode: false,
    };

    it("is true when every captured field matches", () => {
      expect(presetMatchesFields(makePreset(), fields)).toBe(true);
    });

    it("is false when any captured field differs", () => {
      expect(presetMatchesFields(makePreset({ model: "other" }), fields)).toBe(
        false,
      );
      expect(
        presetMatchesFields(makePreset({ smallModelMode: true }), fields),
      ).toBe(false);
    });

    it("compares the toolset only when the preset captured one", () => {
      const tools = { "ppal-delete": false };

      // Legacy preset (no enabledTools) ignores the toolset entirely.
      expect(
        presetMatchesFields(makePreset(), { ...fields, enabledTools: tools }),
      ).toBe(true);

      // A captured toolset must match the buffer's toolset.
      expect(
        presetMatchesFields(makePreset({ enabledTools: tools }), {
          ...fields,
          enabledTools: tools,
        }),
      ).toBe(true);
      expect(
        presetMatchesFields(makePreset({ enabledTools: tools }), {
          ...fields,
          enabledTools: { "ppal-delete": true },
        }),
      ).toBe(false);
    });

    it("compares the notation only when the preset captured one", () => {
      // A legacy preset must not read as perpetually "modified" just because the
      // buffer carries the device's notation.
      expect(
        presetMatchesFields(makePreset(), { ...fields, notation: "stark" }),
      ).toBe(true);

      expect(
        presetMatchesFields(makePreset({ notation: "stark" }), {
          ...fields,
          notation: "stark",
        }),
      ).toBe(true);
      expect(
        presetMatchesFields(makePreset({ notation: "stark" }), {
          ...fields,
          notation: "barbeat",
        }),
      ).toBe(false);
    });
  });

  describe("enabledToolsEqual", () => {
    it("treats absent maps as empty and ignores key order", () => {
      expect(enabledToolsEqual(undefined, {})).toBe(true);
      expect(
        enabledToolsEqual({ a: true, b: false }, { b: false, a: true }),
      ).toBe(true);
    });

    it("is false when a key is missing or a value differs", () => {
      expect(enabledToolsEqual({ a: true }, { a: true, b: false })).toBe(false);
      expect(enabledToolsEqual({ a: true }, { a: false })).toBe(false);
    });
  });
});
