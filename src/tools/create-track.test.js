// src/tools/create-track.test.js
import { describe, expect, it } from "vitest";
import { children, liveApiCall, liveApiId, liveApiSet, mockLiveApiGet } from "../mock-live-api";
import { MAX_AUTO_CREATED_TRACKS } from "./constants";
import { createTrack } from "./create-track";
describe("createTrack", () => {
  beforeEach(() => {
    liveApiId.mockReturnValue("track1");
    mockLiveApiGet({
      LiveSet: { tracks: children("existing1", "existing2") },
    });

    // Mock Live API calls to return track IDs
    liveApiCall.mockImplementation((method, index) => {
      if (method === "create_midi_track") {
        return ["id", `midi_track_${index}`];
      }
      if (method === "create_audio_track") {
        return ["id", `audio_track_${index}`];
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

    expect(liveApiCall).toHaveBeenCalledWithThis(expect.objectContaining({ path: "live_set" }), "create_midi_track", 1);
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_1" }),
      "name",
      "New MIDI Track"
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_1" }),
      "color",
      16711680
    );
    expect(result).toEqual({
      id: "midi_track_1",
      trackIndex: 1,
      type: "midi",
      name: "New MIDI Track",
      color: "#FF0000",
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
      0
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id audio_track_0" }),
      "name",
      "New Audio Track"
    );
    expect(result).toEqual({
      id: "audio_track_0",
      trackIndex: 0,
      type: "audio",
      name: "New Audio Track",
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
      2
    );
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      2,
      expect.objectContaining({ path: "live_set" }),
      "create_midi_track",
      3
    );
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      3,
      expect.objectContaining({ path: "live_set" }),
      "create_midi_track",
      4
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_2" }),
      "name",
      "Drum"
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_3" }),
      "name",
      "Drum 2"
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_4" }),
      "name",
      "Drum 3"
    );

    expect(result).toEqual([
      {
        id: "midi_track_2",
        trackIndex: 2,
        type: "midi",
        name: "Drum",
        color: "#00FF00",
      },
      {
        id: "midi_track_3",
        trackIndex: 3,
        type: "midi",
        name: "Drum 2",
        color: "#00FF00",
      },
      {
        id: "midi_track_4",
        trackIndex: 4,
        type: "midi",
        name: "Drum 3",
        color: "#00FF00",
      },
    ]);
  });

  it("should create tracks without setting properties when not provided", () => {
    const result = createTrack({ trackIndex: 0 });

    expect(liveApiCall).toHaveBeenCalledWithThis(expect.objectContaining({ path: "live_set" }), "create_midi_track", 0);
    expect(liveApiSet).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "midi_track_0",
      trackIndex: 0,
      type: "midi",
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
      "Armed Track"
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "mute",
      true
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "solo",
      false
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "arm",
      true
    );
    expect(result).toEqual({
      id: "midi_track_0",
      trackIndex: 0,
      type: "midi",
      name: "Armed Track",
      mute: true,
      solo: false,
      arm: true,
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
      false
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "solo",
      false
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "id midi_track_0" }),
      "arm",
      false
    );
    expect(result).toEqual({
      id: "midi_track_0",
      trackIndex: 0,
      type: "midi",
      mute: false,
      solo: false,
      arm: false,
    });
  });

  it("should throw error when trackIndex is missing", () => {
    expect(() => createTrack({})).toThrow("createTrack failed: trackIndex is required");
    expect(() => createTrack({ count: 2 })).toThrow("createTrack failed: trackIndex is required");
  });

  it("should throw error when count is less than 1", () => {
    expect(() => createTrack({ trackIndex: 0, count: 0 })).toThrow("createTrack failed: count must be at least 1");
    expect(() => createTrack({ trackIndex: 0, count: -1 })).toThrow("createTrack failed: count must be at least 1");
  });

  it("should throw error when type is invalid", () => {
    expect(() => createTrack({ trackIndex: 0, type: "invalid" })).toThrow(
      'createTrack failed: type must be "midi" or "audio"'
    );
  });

  it("should throw error when creating tracks would exceed maximum", () => {
    expect(() =>
      createTrack({
        trackIndex: MAX_AUTO_CREATED_TRACKS - 2,
        count: 5,
      })
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
      "Solo Track"
    );
    expect(result.name).toBe("Solo Track");
  });

  it("should create tracks of mixed types", () => {
    createTrack({ trackIndex: 0, type: "audio" });
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_audio_track",
      0
    );

    createTrack({ trackIndex: 1, type: "midi" });
    expect(liveApiCall).toHaveBeenCalledWithThis(expect.objectContaining({ path: "live_set" }), "create_midi_track", 1);
  });

  it("should return single object for count=1 and array for count>1", () => {
    const singleResult = createTrack({ trackIndex: 0, count: 1, name: "Single" });
    const arrayResult = createTrack({ trackIndex: 1, count: 2, name: "Multiple" });

    expect(singleResult).toEqual({
      id: "midi_track_0",
      trackIndex: 0,
      type: "midi",
      name: "Single",
    });

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
    expect(arrayResult[0].name).toBe("Multiple");
    expect(arrayResult[1].name).toBe("Multiple 2");
  });
});
