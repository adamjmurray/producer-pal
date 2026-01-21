import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiType,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";

describe("readLiveSet - clips", () => {
  it("passes clip loading parameters to readTrack", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 clip_slots 0 clip": // Path-based access
          return "clip1";
        case "id slot1 clip": // Direct access to slot1's clip
          return "clip1";
        case "clip1":
          return "clip1";
        case "id clip1":
          return "clip1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Clip Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: children("slot1"),
        arrangement_clips: children("arr_clip1"),
        devices: [],
      },
      "id slot1": {
        clip: ["id", "clip1"],
      },
    });

    // Test with minimal clip loading (no session-clips or arrangement-clips in include)
    const result = readLiveSet({
      include: ["regular-tracks", "instruments", "chains"],
    });

    // When session-clips and arrangement-clips are not in include, we get counts instead of arrays
    const tracks = result.tracks as {
      sessionClipCount: number;
      arrangementClipCount: number;
    }[];

    expect(tracks[0]!.sessionClipCount).toBe(1);
    expect(tracks[0]!.arrangementClipCount).toBe(1);
  });

  it("uses default parameter values when no arguments provided", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 clip_slots 0 clip": // Path-based access
          return "clip1";
        case "id slot1 clip":
          return "clip1";
        case "clip1":
          return "clip1";
        case "id clip1":
          return "clip1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Default Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: children("slot1"),
        arrangement_clips: children("arr_clip1"),
        devices: [],
      },
      "id slot1": {
        clip: ["id", "clip1"],
      },
    });

    // Call readLiveSet with no arguments to test defaults
    const result = readLiveSet();

    // Verify default behavior: clip counts only (defaults have session-clips and arrangement-clips false)
    const tracks = result.tracks as {
      sessionClipCount: number;
      arrangementClipCount: number;
    }[];

    expect(tracks[0]!.sessionClipCount).toBe(1);
    expect(tracks[0]!.arrangementClipCount).toBe(1);

    // Verify expensive Live API calls were not made due to default minimal behavior
    expect(liveApiCall).not.toHaveBeenCalledWith("get_notes_extended");
  });

  it("auto-includes minimal track info when session-clips requested without regular-tracks", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip1";
        case "id clip1":
          return "clip1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Minimal Track Test",
        tracks: children("track1"),
        scenes: children("scene1"),
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        back_to_arranger: 0,
        clip_slots: children("slot1"),
        arrangement_clips: children("arr_clip1"),
        devices: [],
        is_foldable: 0,
      },
      "live_set tracks 0 clip_slots 0": {
        clip: ["id", "clip1"],
      },
      "id clip1": {
        name: "Test Clip",
        length: 4.0,
        is_midi_clip: 1,
      },
    });

    const result = readLiveSet({ include: ["session-clips"] });

    // Should include tracks array with minimal info
    const tracks = result.tracks as {
      id: string;
      type: string;
      trackIndex: number;
      name?: string;
      arrangementFollower?: boolean;
      sessionClips?: { id: string }[];
      arrangementClipCount?: number;
      arrangementClips?: unknown[];
    }[];

    expect(tracks).toBeDefined();
    expect(tracks).toHaveLength(1);

    const track = tracks[0]!;

    // Minimal track info: id, type, trackIndex
    expect(track.id).toBe("track1");
    expect(track.type).toBe("midi");
    expect(track.trackIndex).toBe(0);

    // Should NOT include full track properties
    expect(track.name).toBeUndefined();
    expect(track.arrangementFollower).toBeUndefined();

    // Should include session clips array when session-clips requested
    expect(track.sessionClips).toBeDefined();
    expect(track.sessionClips).toHaveLength(1);
    expect(track.sessionClips![0]!.id).toBe("clip1");

    // Should include arrangement clip count (not array)
    expect(track.arrangementClipCount).toBe(1);
    expect(track.arrangementClips).toBeUndefined();
  });

  it("auto-includes minimal track info when arrangement-clips requested without regular-tracks", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "arr_clip1":
          return "arr_clip1";
        case "id arr_clip1":
          return "arr_clip1";
        default:
          return "id 0";
      }
    });

    liveApiType.mockImplementation(function (this: MockLiveAPIContext) {
      if (this.path === "id arr_clip1" || this.id === "arr_clip1") {
        return "Clip";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Minimal Track Test 2",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 0,
        clip_slots: [],
        arrangement_clips: children("arr_clip1"),
        devices: [],
        is_foldable: 0,
      },
      arr_clip1: {
        name: "Arrangement Clip",
        length: 8.0,
        is_midi_clip: 0,
      },
      "id arr_clip1": {
        name: "Arrangement Clip",
        length: 8.0,
        is_midi_clip: 0,
      },
    });

    const result = readLiveSet({ include: ["arrangement-clips"] });

    const tracks = result.tracks as {
      id: string;
      type: string;
      trackIndex: number;
      name?: string;
      arrangementClips?: { id: string }[];
      sessionClipCount?: number;
      sessionClips?: unknown[];
    }[];
    const track = tracks[0]!;

    expect(track.id).toBe("track1");
    expect(track.type).toBe("audio");
    expect(track.trackIndex).toBe(0);

    // Should NOT include full track properties
    expect(track.name).toBeUndefined();

    // Should include arrangement clips array when arrangement-clips requested
    expect(track.arrangementClips).toBeDefined();
    expect(track.arrangementClips).toHaveLength(1);
    expect(track.arrangementClips![0]!.id).toBe("arr_clip1");

    // Should include session clip count (not array)
    expect(track.sessionClipCount).toBe(0);
    expect(track.sessionClips).toBeUndefined();
  });

  it("auto-includes minimal track info when all-clips requested without regular-tracks", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip1";
        case "id clip1":
          return "clip1";
        case "arr_clip1":
          return "arr_clip1";
        case "id arr_clip1":
          return "arr_clip1";
        default:
          return "id 0";
      }
    });

    liveApiType.mockImplementation(function (this: MockLiveAPIContext) {
      if (this.path === "id arr_clip1" || this.id === "arr_clip1") {
        return "Clip";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "All Clips Test",
        tracks: children("track1"),
        scenes: children("scene1"),
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        clip_slots: children("slot1"),
        arrangement_clips: children("arr_clip1"),
        devices: [],
        is_foldable: 0,
      },
      "live_set tracks 0 clip_slots 0": {
        clip: ["id", "clip1"],
      },
      "id clip1": {
        name: "Session Clip",
        length: 4.0,
        is_midi_clip: 1,
      },
      arr_clip1: {
        name: "Arrangement Clip",
        length: 8.0,
        is_midi_clip: 1,
      },
      "id arr_clip1": {
        name: "Arrangement Clip",
        length: 8.0,
        is_midi_clip: 1,
      },
    });

    const result = readLiveSet({ include: ["all-clips"] });

    const tracks = result.tracks as {
      id: string;
      type: string;
      trackIndex: number;
      sessionClips?: unknown[];
      arrangementClips?: unknown[];
    }[];
    const track = tracks[0]!;

    expect(track.id).toBe("track1");
    expect(track.type).toBe("midi");
    expect(track.trackIndex).toBe(0);

    // Should include both clip arrays when all-clips requested
    expect(track.sessionClips).toBeDefined();
    expect(track.sessionClips).toHaveLength(1);
    expect(track.arrangementClips).toBeDefined();
    expect(track.arrangementClips).toHaveLength(1);
  });

  it("uses full track info when regular-tracks explicitly included with clips", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip1";
        case "id clip1":
          return "clip1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Full Track Test",
        tracks: children("track1"),
        scenes: children("scene1"),
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        back_to_arranger: 0,
        clip_slots: children("slot1"),
        arrangement_clips: [],
        devices: [],
        is_foldable: 0,
      },
      "live_set tracks 0 clip_slots 0": {
        clip: ["id", "clip1"],
      },
      "id clip1": {
        name: "Test Clip",
        length: 4.0,
        is_midi_clip: 1,
      },
    });

    const result = readLiveSet({
      include: ["regular-tracks", "session-clips"],
    });

    const tracks = result.tracks as {
      id: string;
      type: string;
      trackIndex: number;
      name: string;
      arrangementFollower: boolean;
    }[];
    const track = tracks[0]!;

    // Should include full track properties
    expect(track.id).toBe("track1");
    expect(track.type).toBe("midi");
    expect(track.trackIndex).toBe(0);
    expect(track.name).toBe("Test Track");
    expect(track.arrangementFollower).toBe(true);
  });

  it("returns null values for non-existent track in minimal mode", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "0"; // Non-existent track
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Non-existent Track Test",
        tracks: children("track1"),
        scenes: [],
      },
    });

    const result = readLiveSet({ include: ["session-clips"] });

    // Track should have null id and type when it doesn't exist
    const tracks = result.tracks as {
      id: string | null;
      type: string | null;
      trackIndex: number;
    }[];

    expect(tracks).toBeDefined();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.id).toBeNull();
    expect(tracks[0]!.type).toBeNull();
    expect(tracks[0]!.trackIndex).toBe(0);
  });

  it("returns empty array for arrangement clips on group tracks with arrangement-clips requested", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "group_track";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Group Track Test",
        tracks: children("group_track"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        clip_slots: [],
        arrangement_clips: [],
        devices: [],
        is_foldable: 1, // This is a group track
      },
    });

    const result = readLiveSet({ include: ["arrangement-clips"] });

    const tracks = result.tracks as {
      id: string;
      trackIndex: number;
      arrangementClips: unknown[];
      sessionClipCount: number;
    }[];
    const track = tracks[0]!;

    expect(track.id).toBe("group_track");
    expect(track.trackIndex).toBe(0);

    // Group tracks should return empty arrangement clips array
    expect(track.arrangementClips).toStrictEqual([]);
    // Session clips should still be counted
    expect(track.sessionClipCount).toBe(0);
  });

  it("returns zero count for arrangement clips on group tracks when counting", () => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "group_track";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Group Track Count Test",
        tracks: children("group_track"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        clip_slots: [],
        arrangement_clips: [],
        devices: [],
        is_foldable: 1,
      },
    });

    // Without arrangement-clips, should get count instead of array
    const result = readLiveSet({ include: ["session-clips"] });

    const tracks = result.tracks as {
      arrangementClipCount: number;
      arrangementClips?: unknown[];
    }[];
    const track = tracks[0]!;

    expect(track.arrangementClipCount).toBe(0);
    expect(track.arrangementClips).toBeUndefined();
  });
});
