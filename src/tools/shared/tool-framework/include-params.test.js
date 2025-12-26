import { describe, expect, it } from "vitest";
import {
  parseIncludeArray,
  includeArrayFromFlags,
  READ_SONG_DEFAULTS,
  READ_TRACK_DEFAULTS,
  READ_SCENE_DEFAULTS,
  READ_CLIP_DEFAULTS,
} from "./include-params.js";

describe("parseIncludeArray", () => {
  it("returns all defaults when include is undefined", () => {
    const result = parseIncludeArray(undefined, READ_SONG_DEFAULTS);

    expect(result).toEqual({
      includeDrumPads: false,
      includeDrumMaps: true,
      includeClipNotes: false,
      includeRackChains: false,
      includeReturnChains: false,
      includeScenes: false,
      includeMidiEffects: false,
      includeInstruments: true,
      includeAudioEffects: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeRegularTracks: true,
      includeReturnTracks: false,
      includeMasterTrack: false,
      includeColor: false,
      includeWarpMarkers: false,
      includeMixer: false,
      includeLocators: false,
    });
  });

  it("returns all false when include is an empty array", () => {
    const result = parseIncludeArray([], READ_SONG_DEFAULTS);

    expect(result).toEqual({
      includeDrumPads: false,
      includeDrumMaps: false,
      includeClipNotes: false,
      includeRackChains: false,
      includeReturnChains: false,
      includeScenes: false,
      includeMidiEffects: false,
      includeInstruments: false,
      includeAudioEffects: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeRegularTracks: false,
      includeReturnTracks: false,
      includeMasterTrack: false,
      includeColor: false,
      includeWarpMarkers: false,
      includeMixer: false,
      includeLocators: false,
    });
  });

  it("handles specific include options", () => {
    const result = parseIncludeArray(
      ["regular-tracks", "instruments"],
      READ_SONG_DEFAULTS,
    );

    expect(result.includeRegularTracks).toBe(true);
    expect(result.includeInstruments).toBe(true);
    expect(result.includeReturnTracks).toBe(false);
    expect(result.includeMasterTrack).toBe(false);
  });

  it("expands shortcut mappings", () => {
    const result = parseIncludeArray(["all-tracks"], READ_SONG_DEFAULTS);

    expect(result.includeRegularTracks).toBe(true);
    expect(result.includeReturnTracks).toBe(true);
    expect(result.includeMasterTrack).toBe(true);
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
    expect(result.includeDrumPads).toBe(true);
    expect(result.includeClipNotes).toBe(true);
    expect(result.includeRackChains).toBe(true);
    expect(result.includeScenes).toBe(true);
    expect(result.includeMidiEffects).toBe(true);
    expect(result.includeInstruments).toBe(true);
    expect(result.includeAudioEffects).toBe(true);
    expect(result.includeRoutings).toBe(true);
    expect(result.includeSessionClips).toBe(true);
    expect(result.includeArrangementClips).toBe(true);
    expect(result.includeRegularTracks).toBe(true);
    expect(result.includeReturnTracks).toBe(true);
    expect(result.includeMasterTrack).toBe(true);
  });

  it("handles track defaults correctly", () => {
    const result = parseIncludeArray(undefined, READ_TRACK_DEFAULTS);

    expect(result).toEqual(
      expect.objectContaining({
        includeClipNotes: true,
        includeDrumMaps: true,
        includeRackChains: false,
        includeInstruments: true,
        includeSessionClips: true,
        includeArrangementClips: true,
      }),
    );
  });

  it("handles scene defaults correctly", () => {
    const result = parseIncludeArray(undefined, READ_SCENE_DEFAULTS);

    expect(result).toEqual(
      expect.objectContaining({
        includeClips: false,
        includeClipNotes: false,
      }),
    );
  });

  it("handles clip defaults correctly", () => {
    const result = parseIncludeArray(undefined, READ_CLIP_DEFAULTS);

    expect(result).toEqual(
      expect.objectContaining({
        includeClipNotes: true,
      }),
    );
  });

  it("expands wildcard for clip tool type", () => {
    // Test that wildcard expansion works when tool type is detected as "clip"
    // This happens when defaults has only includeClipNotes
    const result = parseIncludeArray(["*"], {
      includeClipNotes: false,
    });

    expect(result.includeClipNotes).toBe(true);
    expect(result.includeColor).toBe(true);
    expect(result.includeWarpMarkers).toBe(true);
  });
});

describe("includeArrayFromFlags", () => {
  it("converts flags back to array format", () => {
    const flags = {
      includeDrumPads: false,
      includeClipNotes: true,
      includeRackChains: true,
      includeScenes: true,
      includeMidiEffects: false,
      includeInstruments: true,
      includeAudioEffects: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeRegularTracks: true,
      includeReturnTracks: false,
      includeMasterTrack: false,
    };

    const result = includeArrayFromFlags(flags);

    expect(result).toEqual([
      "clip-notes",
      "chains",
      "scenes",
      "instruments",
      "regular-tracks",
    ]);
  });

  it("returns empty array when all flags are false", () => {
    const flags = {
      includeDrumPads: false,
      includeClipNotes: false,
      includeRackChains: false,
      includeScenes: false,
      includeMidiEffects: false,
      includeInstruments: false,
      includeAudioEffects: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeRegularTracks: false,
      includeReturnTracks: false,
      includeMasterTrack: false,
    };

    const result = includeArrayFromFlags(flags);

    expect(result).toEqual([]);
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
      const result = parseIncludeArray(["drum-maps"], READ_SONG_DEFAULTS);

      expect(result.includeDrumMaps).toBe(true);
      expect(result.includeRackChains).toBe(false);
    });

    it("parseIncludeArray handles drum-maps with other options", () => {
      const result = parseIncludeArray(
        ["instruments", "drum-maps", "clip-notes"],
        READ_SONG_DEFAULTS,
      );

      expect(result.includeDrumMaps).toBe(true);
      expect(result.includeInstruments).toBe(true);
      expect(result.includeClipNotes).toBe(true);
      expect(result.includeRackChains).toBe(false);
    });

    it("includeArrayFromFlags includes drum-maps when flag is true", () => {
      const flags = {
        includeDrumMaps: true,
        includeRackChains: false,
        includeInstruments: true,
      };

      const result = includeArrayFromFlags(flags);

      expect(result).toContain("drum-maps");
      expect(result).toContain("instruments");
      expect(result).not.toContain("chains");
    });

    it("includeArrayFromFlags excludes drum-maps when flag is false", () => {
      const flags = {
        includeDrumMaps: false,
        includeRackChains: true,
        includeInstruments: true,
      };

      const result = includeArrayFromFlags(flags);

      expect(result).not.toContain("drum-maps");
      expect(result).toContain("chains");
      expect(result).toContain("instruments");
    });
  });
});
