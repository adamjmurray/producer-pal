// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  parseIncludeArray,
  includeArrayFromFlags,
  READ_SONG_DEFAULTS,
  READ_TRACK_DEFAULTS,
  READ_SCENE_DEFAULTS,
  READ_CLIP_DEFAULTS,
} from "./include-params.ts";

describe("parseIncludeArray", () => {
  it("returns all defaults when include is undefined", () => {
    const result = parseIncludeArray(undefined, READ_SONG_DEFAULTS);

    expect(result).toStrictEqual({
      includeDrumMaps: false,
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
    });
  });

  it("returns all false when include is an empty array", () => {
    const result = parseIncludeArray([], READ_SONG_DEFAULTS);

    expect(result).toStrictEqual({
      includeDrumMaps: false,
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
    });
  });

  it("handles specific include options", () => {
    const result = parseIncludeArray(["tracks", "scenes"], READ_SONG_DEFAULTS);

    expect(result.includeTracks).toBe(true);
    expect(result.includeScenes).toBe(true);
  });

  it("expands all-devices shortcut", () => {
    const result = parseIncludeArray(["all-devices"], READ_TRACK_DEFAULTS);

    expect(result.includeMidiEffects).toBe(true);
    expect(result.includeInstruments).toBe(true);
    expect(result.includeAudioEffects).toBe(true);
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

  it("handles track defaults correctly", () => {
    const result = parseIncludeArray(undefined, READ_TRACK_DEFAULTS);

    expect(result).toStrictEqual(
      expect.objectContaining({
        includeClipNotes: false,
        includeDrumMaps: false,
        includeDevices: false,
        includeInstruments: false,
        includeSessionClips: false,
        includeArrangementClips: false,
      }),
    );
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
    expect(result.includeDrumMaps).toBe(true);
    // Legacy device categories not in track options list
    expect(result.includeMidiEffects).toBe(false);
    expect(result.includeInstruments).toBe(false);
    expect(result.includeAudioEffects).toBe(false);
  });

  it("handles scene defaults correctly", () => {
    const result = parseIncludeArray(undefined, READ_SCENE_DEFAULTS);

    expect(result).toStrictEqual(
      expect.objectContaining({
        includeClips: false,
        includeClipNotes: false,
      }),
    );
  });

  it("handles clip defaults correctly", () => {
    const result = parseIncludeArray(undefined, READ_CLIP_DEFAULTS);

    expect(result).toStrictEqual(
      expect.objectContaining({
        includeClipNotes: false,
        includeSample: false,
        includeTiming: false,
        includeWarp: false,
      }),
    );
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

    expect(result).toStrictEqual([
      "clip-notes",
      "scenes",
      "instruments",
      "tracks",
    ]);
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

  describe("drum-maps option", () => {
    it("parseIncludeArray recognizes drum-maps", () => {
      const result = parseIncludeArray(["drum-maps"], READ_TRACK_DEFAULTS);

      expect(result.includeDrumMaps).toBe(true);
    });

    it("parseIncludeArray handles drum-maps with other options", () => {
      const result = parseIncludeArray(
        ["devices", "drum-maps", "clip-notes"],
        READ_TRACK_DEFAULTS,
      );

      expect(result.includeDrumMaps).toBe(true);
      expect(result.includeDevices).toBe(true);
      expect(result.includeClipNotes).toBe(true);
    });

    it("includeArrayFromFlags includes drum-maps when flag is true", () => {
      const flags = {
        includeDrumMaps: true,
        includeInstruments: true,
      };

      const result = includeArrayFromFlags(flags);

      expect(result).toContain("drum-maps");
      expect(result).toContain("instruments");
    });

    it("includeArrayFromFlags excludes drum-maps when flag is false", () => {
      const flags = {
        includeDrumMaps: false,
        includeInstruments: true,
      };

      const result = includeArrayFromFlags(flags);

      expect(result).not.toContain("drum-maps");
      expect(result).toContain("instruments");
    });
  });
});
