import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { MAX_AUTO_CREATED_TRACKS } from "#src/tools/constants.ts";
import { createTrack } from "./create-track.ts";

vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  log: vi.fn(),
  error: vi.fn(),
}));

describe("createTrack", () => {
  let returnTrackCounter = 0;

  beforeEach(() => {
    returnTrackCounter = 0;
    liveApiId.mockReturnValue("track1");
    mockLiveApiGet({
      LiveSet: {
        tracks: children("existing1", "existing2"),
        return_tracks: children("returnA", "returnB"),
      },
    });

    // Mock Live API calls to return track IDs
    liveApiCall.mockImplementation((method: string, ...args: unknown[]) => {
      const index = args[0];

      if (method === "create_midi_track") {
        return ["id", `midi_track_${String(index)}`];
      }

      if (method === "create_audio_track") {
        return ["id", `audio_track_${String(index)}`];
      }

      if (method === "create_return_track") {
        return ["id", `return_track_${returnTrackCounter++}`];
      }

      return null;
    });
  });

  it("should create a single MIDI track at the specified index", () => {
    const result = createTrack({
      trackIndex: 1,
      name: "New MIDI Track",
      color: "#FF0000",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_midi_track",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_1" }),
      "name",
      "New MIDI Track",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_1" }),
      "color",
      16711680,
    );
    expect(result).toStrictEqual({
      id: "midi_track_1",
      trackIndex: 1,
    });
  });

  it("should create a single audio track when type is audio", () => {
    const result = createTrack({
      trackIndex: 0,
      type: "audio",
      name: "New Audio Track",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_audio_track",
      0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id audio_track_0" }),
      "name",
      "New Audio Track",
    );
    expect(result).toStrictEqual({
      id: "audio_track_0",
      trackIndex: 0,
    });
  });

  it("should create multiple tracks with auto-incrementing names", () => {
    const result = createTrack({
      trackIndex: 2,
      count: 3,
      name: "Drum",
      color: "#00FF00",
    });

    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      1,
      expect.objectContaining({ path: "live_set" }),
      "create_midi_track",
      2,
    );
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      2,
      expect.objectContaining({ path: "live_set" }),
      "create_midi_track",
      3,
    );
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      3,
      expect.objectContaining({ path: "live_set" }),
      "create_midi_track",
      4,
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_2" }),
      "name",
      "Drum",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_3" }),
      "name",
      "Drum 2",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_4" }),
      "name",
      "Drum 3",
    );

    expect(result).toStrictEqual([
      {
        id: "midi_track_2",
        trackIndex: 2,
      },
      {
        id: "midi_track_3",
        trackIndex: 3,
      },
      {
        id: "midi_track_4",
        trackIndex: 4,
      },
    ]);
  });

  it("should create tracks without setting properties when not provided", () => {
    const result = createTrack({ trackIndex: 0 });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_midi_track",
      0,
    );
    expect(liveApiSet).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      id: "midi_track_0",
      trackIndex: 0,
    });
  });

  it("should create tracks with mute, solo, and arm states", () => {
    const result = createTrack({
      trackIndex: 0,
      name: "Armed Track",
      mute: true,
      solo: false,
      arm: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "name",
      "Armed Track",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "mute",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "solo",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "arm",
      true,
    );
    expect(result).toStrictEqual({
      id: "midi_track_0",
      trackIndex: 0,
    });
  });

  it("should handle boolean false values correctly", () => {
    const result = createTrack({
      trackIndex: 0,
      mute: false,
      solo: false,
      arm: false,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "mute",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "solo",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "arm",
      false,
    );
    expect(result).toStrictEqual({
      id: "midi_track_0",
      trackIndex: 0,
    });
  });

  it("should append track to end when trackIndex is omitted", () => {
    const result = createTrack({ name: "Appended Track" });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_midi_track",
      -1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_-1" }),
      "name",
      "Appended Track",
    );
    // Result trackIndex should reflect actual position (count of existing tracks)
    expect(result).toStrictEqual({
      id: "midi_track_-1",
      trackIndex: 2, // existing tracks count
    });
  });

  it("should append track to end when trackIndex is -1", () => {
    const result = createTrack({ trackIndex: -1, name: "Appended Track" });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_midi_track",
      -1,
    );
    expect((result as { trackIndex: number }).trackIndex).toBe(2); // existing tracks count
  });

  it("should throw error when count is less than 1", () => {
    expect(() => createTrack({ trackIndex: 0, count: 0 })).toThrow(
      "createTrack failed: count must be at least 1",
    );
    expect(() => createTrack({ trackIndex: 0, count: -1 })).toThrow(
      "createTrack failed: count must be at least 1",
    );
  });

  // Note: type validation is now handled by Zod schema

  it("should throw error when creating tracks would exceed maximum", () => {
    expect(() =>
      createTrack({
        trackIndex: MAX_AUTO_CREATED_TRACKS - 2,
        count: 5,
      }),
    ).toThrow(/would exceed the maximum allowed tracks/);
  });

  it("should handle single track name without incrementing", () => {
    const result = createTrack({
      trackIndex: 0,
      count: 1,
      name: "Solo Track",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "name",
      "Solo Track",
    );
    expect(result).toStrictEqual({
      id: "midi_track_0",
      trackIndex: 0,
    });
  });

  it("should create tracks of mixed types", () => {
    createTrack({ trackIndex: 0, type: "audio" });
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_audio_track",
      0,
    );

    createTrack({ trackIndex: 1, type: "midi" });
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_midi_track",
      1,
    );
  });

  it("should return single object for count=1 and array for count>1", () => {
    const singleResult = createTrack({
      trackIndex: 0,
      count: 1,
      name: "Single",
    });
    const arrayResult = createTrack({
      trackIndex: 1,
      count: 2,
      name: "Multiple",
    });

    expect(singleResult).toStrictEqual({
      id: "midi_track_0",
      trackIndex: 0,
    });

    expect(Array.isArray(arrayResult)).toBe(true);
    const results = arrayResult as Array<{ id: string; trackIndex: number }>;

    expect(results).toHaveLength(2);
    expect(results[0]).toStrictEqual({
      id: "midi_track_1",
      trackIndex: 1,
    });
    expect(results[1]).toStrictEqual({
      id: "midi_track_2",
      trackIndex: 2,
    });
  });

  describe("return tracks", () => {
    it("should create a single return track", () => {
      const result = createTrack({ type: "return", name: "New Return" });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "create_return_track",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id return_track_0" }),
        "name",
        "New Return",
      );
      // Result returnTrackIndex should reflect position (2 existing return tracks)
      expect(result).toStrictEqual({
        id: "return_track_0",
        returnTrackIndex: 2,
      });
    });

    it("should create multiple return tracks", () => {
      const result = createTrack({ type: "return", count: 2, name: "FX" });

      expect(liveApiCall).toHaveBeenCalledTimes(2);
      expect(liveApiCall).toHaveBeenNthCalledWithThis(
        1,
        expect.objectContaining({ path: "live_set" }),
        "create_return_track",
      );
      expect(liveApiCall).toHaveBeenNthCalledWithThis(
        2,
        expect.objectContaining({ path: "live_set" }),
        "create_return_track",
      );

      expect(result).toStrictEqual([
        { id: "return_track_0", returnTrackIndex: 2 },
        { id: "return_track_1", returnTrackIndex: 3 },
      ]);
    });

    it("should create return track with color", () => {
      createTrack({ type: "return", name: "Reverb", color: "#0000FF" });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id return_track_0" }),
        "color",
        255,
      );
    });

    it("should warn when trackIndex provided for return track", () => {
      createTrack({ type: "return", trackIndex: 5, name: "Ignored Index" });

      expect(console.error).toHaveBeenCalledWith(
        "createTrack: trackIndex is ignored for return tracks (always added at end)",
      );
      // Should still create the track
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "create_return_track",
      );
    });
  });

  describe("comma-separated names", () => {
    it("should use comma-separated names for each track when count matches", () => {
      const result = createTrack({
        trackIndex: 0,
        count: 3,
        name: "kick,snare,hat",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_0" }),
        "name",
        "kick",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_1" }),
        "name",
        "snare",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_2" }),
        "name",
        "hat",
      );
      expect(result).toHaveLength(3);
    });

    it("should fall back to numbered naming when count exceeds names", () => {
      const result = createTrack({
        trackIndex: 0,
        count: 4,
        name: "kick,snare,hat",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_0" }),
        "name",
        "kick",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_1" }),
        "name",
        "snare",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_2" }),
        "name",
        "hat",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_3" }),
        "name",
        "hat 2",
      );
      expect(result).toHaveLength(4);
    });

    it("should ignore extra names when count is less than names", () => {
      const result = createTrack({
        trackIndex: 0,
        count: 2,
        name: "kick,snare,hat",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_0" }),
        "name",
        "kick",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_1" }),
        "name",
        "snare",
      );
      expect(result).toHaveLength(2);
    });

    it("should preserve commas in name when count is 1", () => {
      const result = createTrack({
        trackIndex: 0,
        count: 1,
        name: "kick,snare",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_0" }),
        "name",
        "kick,snare",
      );
      expect(result).toStrictEqual({
        id: "midi_track_0",
        trackIndex: 0,
      });
    });

    it("should trim whitespace around comma-separated names", () => {
      createTrack({
        trackIndex: 0,
        count: 3,
        name: " kick , snare , hat ",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_0" }),
        "name",
        "kick",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_1" }),
        "name",
        "snare",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_2" }),
        "name",
        "hat",
      );
    });

    it("should continue numbering from 2 when falling back", () => {
      createTrack({
        trackIndex: 0,
        count: 5,
        name: "kick,snare,hat",
      });

      // First 3 tracks use the provided names
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_0" }),
        "name",
        "kick",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_1" }),
        "name",
        "snare",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_2" }),
        "name",
        "hat",
      );
      // Subsequent tracks use "hat 2", "hat 3" (starting from 2)
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_3" }),
        "name",
        "hat 2",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_4" }),
        "name",
        "hat 3",
      );
    });
  });

  describe("comma-separated colors", () => {
    it("should cycle through colors with modular arithmetic", () => {
      createTrack({
        trackIndex: 0,
        count: 4,
        name: "Track",
        color: "#FF0000,#00FF00",
      });

      // Colors cycle: red, green, red, green
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_0" }),
        "color",
        16711680, // #FF0000
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_1" }),
        "color",
        65280, // #00FF00
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_2" }),
        "color",
        16711680, // #FF0000
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_3" }),
        "color",
        65280, // #00FF00
      );
    });

    it("should use colors in order when count matches", () => {
      createTrack({
        trackIndex: 0,
        count: 3,
        name: "Track",
        color: "#FF0000,#00FF00,#0000FF",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_0" }),
        "color",
        16711680, // #FF0000
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_1" }),
        "color",
        65280, // #00FF00
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_2" }),
        "color",
        255, // #0000FF
      );
    });

    it("should ignore extra colors when count is less than colors", () => {
      createTrack({
        trackIndex: 0,
        count: 2,
        name: "Track",
        color: "#FF0000,#00FF00,#0000FF",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_0" }),
        "color",
        16711680, // #FF0000
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_1" }),
        "color",
        65280, // #00FF00
      );
      // #0000FF is not used
    });

    it("should throw error when count is 1 and color contains commas", () => {
      // When count=1, commas are not parsed, so the invalid color format throws
      expect(() =>
        createTrack({
          trackIndex: 0,
          count: 1,
          name: "Track",
          color: "#FF0000,#00FF00",
        }),
      ).toThrow('Invalid color format: must be "#RRGGBB"');
    });

    it("should trim whitespace around comma-separated colors", () => {
      createTrack({
        trackIndex: 0,
        count: 2,
        name: "Track",
        color: " #FF0000 , #00FF00 ",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_0" }),
        "color",
        16711680, // #FF0000
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "id midi_track_1" }),
        "color",
        65280, // #00FF00
      );
    });
  });
});
