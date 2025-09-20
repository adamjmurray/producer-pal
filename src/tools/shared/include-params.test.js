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
      includeDrumChains: false,
      includeDrumMaps: true,
      includeNotes: false,
      includeRackChains: false,
      includeScenes: false,
      includeMidiEffects: false,
      includeInstrument: true,
      includeAudioEffects: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeRegularTracks: true,
      includeReturnTracks: false,
      includeMasterTrack: false,
    });
  });

  it("returns all false when include is an empty array", () => {
    const result = parseIncludeArray([], READ_SONG_DEFAULTS);

    expect(result).toEqual({
      includeDrumChains: false,
      includeDrumMaps: false,
      includeNotes: false,
      includeRackChains: false,
      includeScenes: false,
      includeMidiEffects: false,
      includeInstrument: false,
      includeAudioEffects: false,
      includeRoutings: false,
      includeAvailableRoutings: false,
      includeSessionClips: false,
      includeArrangementClips: false,
      includeClips: false,
      includeRegularTracks: false,
      includeReturnTracks: false,
      includeMasterTrack: false,
    });
  });

  it("handles specific include options", () => {
    const result = parseIncludeArray(
      ["regular-tracks", "instrument"],
      READ_SONG_DEFAULTS,
    );

    expect(result.includeRegularTracks).toBe(true);
    expect(result.includeInstrument).toBe(true);
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
    expect(result.includeInstrument).toBe(true);
    expect(result.includeAudioEffects).toBe(true);
  });

  it("expands wildcard to all available options", () => {
    const result = parseIncludeArray(["*"], READ_SONG_DEFAULTS);

    // All song-related options should be true
    expect(result.includeDrumChains).toBe(true);
    expect(result.includeNotes).toBe(true);
    expect(result.includeRackChains).toBe(true);
    expect(result.includeScenes).toBe(true);
    expect(result.includeMidiEffects).toBe(true);
    expect(result.includeInstrument).toBe(true);
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
        includeNotes: true,
        includeDrumMaps: true,
        includeRackChains: false,
        includeInstrument: true,
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
        includeNotes: false,
      }),
    );
  });

  it("handles clip defaults correctly", () => {
    const result = parseIncludeArray(undefined, READ_CLIP_DEFAULTS);

    expect(result).toEqual(
      expect.objectContaining({
        includeNotes: true,
      }),
    );
  });
});

describe("includeArrayFromFlags", () => {
  it("converts flags back to array format", () => {
    const flags = {
      includeDrumChains: false,
      includeNotes: true,
      includeRackChains: true,
      includeScenes: true,
      includeMidiEffects: false,
      includeInstrument: true,
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
      "notes",
      "rack-chains",
      "scenes",
      "instrument",
      "regular-tracks",
    ]);
  });

  it("returns empty array when all flags are false", () => {
    const flags = {
      includeDrumChains: false,
      includeNotes: false,
      includeRackChains: false,
      includeScenes: false,
      includeMidiEffects: false,
      includeInstrument: false,
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

  describe("drum-maps option", () => {
    it("parseIncludeArray recognizes drum-maps", () => {
      const result = parseIncludeArray(["drum-maps"], READ_SONG_DEFAULTS);

      expect(result.includeDrumMaps).toBe(true);
      expect(result.includeRackChains).toBe(false);
    });

    it("parseIncludeArray handles drum-maps with other options", () => {
      const result = parseIncludeArray(
        ["instrument", "drum-maps", "notes"],
        READ_SONG_DEFAULTS,
      );

      expect(result.includeDrumMaps).toBe(true);
      expect(result.includeInstrument).toBe(true);
      expect(result.includeNotes).toBe(true);
      expect(result.includeRackChains).toBe(false);
    });

    it("includeArrayFromFlags includes drum-maps when flag is true", () => {
      const flags = {
        includeDrumMaps: true,
        includeRackChains: false,
        includeInstrument: true,
      };

      const result = includeArrayFromFlags(flags);

      expect(result).toContain("drum-maps");
      expect(result).toContain("instrument");
      expect(result).not.toContain("rack-chains");
    });

    it("includeArrayFromFlags excludes drum-maps when flag is false", () => {
      const flags = {
        includeDrumMaps: false,
        includeRackChains: true,
        includeInstrument: true,
      };

      const result = includeArrayFromFlags(flags);

      expect(result).not.toContain("drum-maps");
      expect(result).toContain("rack-chains");
      expect(result).toContain("instrument");
    });
  });
});
