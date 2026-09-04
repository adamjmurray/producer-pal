// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  expandWildcardIncludes,
  parseIncludeArray,
  includeArrayFromFlags,
  READ_SONG_DEFAULTS,
  READ_TRACK_DEFAULTS,
  READ_SCENE_DEFAULTS,
  READ_CLIP_DEFAULTS,
  type IncludeFlags,
} from "../include-params.ts";

const ALL_FLAGS_FALSE = {
  includeDrumMap: false,
  includeClipNotes: false,
  includeScenes: false,
  includeMidiEffects: false,
  includeInstruments: false,
  includeAudioEffects: false,
  includeDevices: false,
  includeRoutings: false,
  includeAvailableRoutings: false,
  includeSessionClips: false,
  includeArrangementClips: false,
  includeClips: false,
  includeTracks: false,
  includeSample: false,
  includeColor: false,
  includeTiming: false,
  includeWarp: false,
  includeMixer: false,
  includeLocators: false,
};

describe("parseIncludeArray", () => {
  it("returns all defaults when include is undefined", () => {
    const result = parseIncludeArray(undefined, READ_SONG_DEFAULTS);

    expect(result).toStrictEqual(ALL_FLAGS_FALSE);
  });

  it("returns all false when include is an empty array", () => {
    const result = parseIncludeArray([], READ_SONG_DEFAULTS);

    expect(result).toStrictEqual(ALL_FLAGS_FALSE);
  });

  it("handles specific include options", () => {
    const result = parseIncludeArray(["tracks", "scenes"], READ_SONG_DEFAULTS);

    expect(result.includeTracks).toBe(true);
    expect(result.includeScenes).toBe(true);
  });

  it("expands wildcard to all available options", () => {
    const result = parseIncludeArray(["*"], READ_SONG_DEFAULTS);

    // All song-related options should be true
    expect(result.includeScenes).toBe(true);
    expect(result.includeRoutings).toBe(true);
    expect(result.includeTracks).toBe(true);
    expect(result.includeColor).toBe(true);
    expect(result.includeMixer).toBe(true);
    expect(result.includeLocators).toBe(true);

    // Clip/device options no longer in song scope
    expect(result.includeClipNotes).toBe(false);
    expect(result.includeMidiEffects).toBe(false);
    expect(result.includeSessionClips).toBe(false);
  });

  it("keeps explicit non-tool-type options alongside the wildcard", () => {
    // "notes" is not a song option, so it must survive the '*' expansion (the
    // '*' is filtered out, the rest are kept and merged with the song options).
    const result = parseIncludeArray(["*", "notes"], READ_SONG_DEFAULTS);

    expect(result.includeClipNotes).toBe(true);
    expect(result.includeTracks).toBe(true);
  });

  it("handles track defaults correctly", () => {
    const result = parseIncludeArray(undefined, READ_TRACK_DEFAULTS);

    // Full-object match so every default flag is asserted false (a default that
    // silently flipped to true would otherwise slip through).
    expect(result).toStrictEqual(ALL_FLAGS_FALSE);
  });

  it("recognizes devices include for track", () => {
    const result = parseIncludeArray(["devices"], READ_TRACK_DEFAULTS);

    expect(result.includeDevices).toBe(true);
    expect(result.includeMidiEffects).toBe(false);
    expect(result.includeInstruments).toBe(false);
    expect(result.includeAudioEffects).toBe(false);
  });

  it("expands wildcard for track tool type", () => {
    const result = parseIncludeArray(["*"], READ_TRACK_DEFAULTS);

    expect(result.includeDevices).toBe(true);
    expect(result.includeSessionClips).toBe(true);
    expect(result.includeArrangementClips).toBe(true);
    expect(result.includeDrumMap).toBe(true);
    expect(result.includeWarp).toBe(true);
    // Legacy device categories not in track options list
    expect(result.includeMidiEffects).toBe(false);
    expect(result.includeInstruments).toBe(false);
    expect(result.includeAudioEffects).toBe(false);
  });

  it("expands wildcard for scene tool type", () => {
    const result = parseIncludeArray(["*"], READ_SCENE_DEFAULTS);

    expect(result.includeClips).toBe(true);
    expect(result.includeWarp).toBe(true);
  });

  it("handles scene defaults correctly", () => {
    const result = parseIncludeArray(undefined, READ_SCENE_DEFAULTS);

    expect(result).toStrictEqual(ALL_FLAGS_FALSE);
  });

  it("handles clip defaults correctly", () => {
    const result = parseIncludeArray(undefined, READ_CLIP_DEFAULTS);

    expect(result).toStrictEqual(ALL_FLAGS_FALSE);
  });

  it("expands wildcard for clip tool type", () => {
    const result = parseIncludeArray(["*"], READ_CLIP_DEFAULTS);

    expect(result.includeClipNotes).toBe(true);
    expect(result.includeSample).toBe(true);
    expect(result.includeColor).toBe(true);
    expect(result.includeTiming).toBe(true);
    expect(result.includeWarp).toBe(true);
  });
});

describe("includeArrayFromFlags", () => {
  it("converts flags back to array format", () => {
    const flags = {
      includeClipNotes: true,
      includeScenes: true,
      includeMidiEffects: false,
      includeInstruments: true,
      includeAudioEffects: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeTracks: true,
    };

    const result = includeArrayFromFlags(flags);

    expect(result).toStrictEqual(["notes", "scenes", "instruments", "tracks"]);
  });

  it("returns empty array when all flags are false", () => {
    const flags = {
      includeClipNotes: false,
      includeScenes: false,
      includeMidiEffects: false,
      includeInstruments: false,
      includeAudioEffects: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeTracks: false,
    };

    const result = includeArrayFromFlags(flags);

    expect(result).toStrictEqual([]);
  });

  it("includes available-routings when flag is true", () => {
    const flags = {
      includeAvailableRoutings: true,
    };

    const result = includeArrayFromFlags(flags);

    expect(result).toContain("available-routings");
  });

  it("includes clips when flag is true", () => {
    const flags = {
      includeClips: true,
    };

    const result = includeArrayFromFlags(flags);

    expect(result).toContain("clips");
  });

  describe("drum-map option", () => {
    it("parseIncludeArray recognizes drum-map", () => {
      const result = parseIncludeArray(["drum-map"], READ_TRACK_DEFAULTS);

      expect(result.includeDrumMap).toBe(true);
    });

    it("parseIncludeArray handles drum-map with other options", () => {
      const result = parseIncludeArray(
        ["devices", "drum-map", "notes"],
        READ_TRACK_DEFAULTS,
      );

      expect(result.includeDrumMap).toBe(true);
      expect(result.includeDevices).toBe(true);
      expect(result.includeClipNotes).toBe(true);
    });

    it("includeArrayFromFlags includes drum-map when flag is true", () => {
      const flags = {
        includeDrumMap: true,
        includeInstruments: true,
      };

      const result = includeArrayFromFlags(flags);

      expect(result).toContain("drum-map");
      expect(result).toContain("instruments");
    });

    it("includeArrayFromFlags excludes drum-map when flag is false", () => {
      const flags = {
        includeDrumMap: false,
        includeInstruments: true,
      };

      const result = includeArrayFromFlags(flags);

      expect(result).not.toContain("drum-map");
      expect(result).toContain("instruments");
    });
  });

  describe("wildcard expansion fallback", () => {
    it("falls back to song options when defaults have no known structure", () => {
      const result = parseIncludeArray(["*"], {});

      // Should expand '*' using song options as fallback
      expect(result.includeTracks).toBe(true);
      expect(result.includeScenes).toBe(true);
    });
  });
});

describe("expandWildcardIncludes", () => {
  it("passes undefined through", () => {
    expect(
      expandWildcardIncludes(undefined, READ_TRACK_DEFAULTS),
    ).toBeUndefined();
  });

  it("leaves an array without a wildcard alone", () => {
    expect(
      expandWildcardIncludes(["session-clips", "notes"], READ_TRACK_DEFAULTS),
    ).toStrictEqual(["session-clips", "notes"]);
  });

  it("expands the wildcard against the tool's own options", () => {
    const expanded = expandWildcardIncludes(["*"], READ_TRACK_DEFAULTS);

    // Nothing a nested clip read could re-expand, and nothing the track tool
    // doesn't publish (e.g. "tracks" and "locators" are song-only).
    expect(expanded).not.toContain("*");
    expect(expanded).toContain("warp");
    expect(expanded).not.toContain("tracks");
    expect(expanded).not.toContain("locators");
  });

  it("expands the wildcard for a scene against the scene options", () => {
    expect(expandWildcardIncludes(["*"], READ_SCENE_DEFAULTS)).toStrictEqual([
      "clips",
      "notes",
      "sample",
      "color",
      "timing",
      "warp",
    ]);
  });
});

// Exhaustive option ↔ flag mapping: every option string maps to exactly one
// flag in both directions. Locks each option constant and each FLAG_TO_OPTION
// entry so a blanked string or dropped tuple can't slip through untested.
describe("option ↔ flag round-trip (every option)", () => {
  const PAIRS: [keyof IncludeFlags, string][] = [
    ["includeDrumMap", "drum-map"],
    ["includeClipNotes", "notes"],
    ["includeScenes", "scenes"],
    ["includeMidiEffects", "midi-effects"],
    ["includeInstruments", "instruments"],
    ["includeAudioEffects", "audio-effects"],
    ["includeDevices", "devices"],
    ["includeRoutings", "routings"],
    ["includeAvailableRoutings", "available-routings"],
    ["includeSessionClips", "session-clips"],
    ["includeArrangementClips", "arrangement-clips"],
    ["includeClips", "clips"],
    ["includeTracks", "tracks"],
    ["includeSample", "sample"],
    ["includeColor", "color"],
    ["includeTiming", "timing"],
    ["includeWarp", "warp"],
    ["includeMixer", "mixer"],
    ["includeLocators", "locators"],
  ];

  it.each(PAIRS)("parse: flag %s comes from option %s", (flag, option) => {
    expect(parseIncludeArray([option], {})[flag]).toBe(true);
  });

  it.each(PAIRS)("fromFlags: flag %s maps to option %s", (flag, option) => {
    const flags: Partial<IncludeFlags> = {};

    flags[flag] = true;

    expect(includeArrayFromFlags(flags)).toStrictEqual([option]);
  });
});
