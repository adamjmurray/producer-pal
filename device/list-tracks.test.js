// device/list-tracks.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Setup mocks
const mockLiveApiCall = vi.fn();
const mockLiveApiGet = vi.fn();

// Create mock LiveAPI instances map to track constructed objects
const mockInstances = new Map();

// Mock LiveAPI class
class MockLiveAPI {
  constructor(path) {
    this.path = path;

    // Track this instance
    mockInstances.set(path, this);

    // Set properties
    this.unquotedpath = path;
    this.call = mockLiveApiCall;
    this.get = mockLiveApiGet;
  }
}

// Setup
beforeEach(() => {
  mockInstances.clear();
  mockLiveApiGet.mockReset();
  mockLiveApiCall.mockReset();
  vi.stubGlobal("LiveAPI", MockLiveAPI);
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listTracks", () => {
  it("should return an empty array when there are no tracks", () => {
    // Handle Song.get("tracks")
    mockLiveApiGet.mockReturnValue([]);

    const { listTracks } = require("./list-tracks");
    const result = listTracks();

    expect(result).toEqual([]);
  });

  it("should list tracks with their properties", () => {
    // Setup mock implementation based on call order
    // TODO: This wil be fragile against implementation changes.
    // We should actually model out some tracks and clips and such and have the mock LiveAPI
    // work off of an actual in-memory model
    mockLiveApiGet
      // First calls from live_set
      .mockReturnValueOnce(["id", "track1", "id", "track2"]) // get("tracks")

      // Track 1 properties
      .mockReturnValueOnce(["MIDI Track"]) // name
      .mockReturnValueOnce([5263440]) // color
      .mockReturnValueOnce([1]) // has_midi_input
      .mockReturnValueOnce([0]) // mute
      .mockReturnValueOnce([0]) // solo
      .mockReturnValueOnce([1]) // arm
      .mockReturnValueOnce(["id", "cs1", "id", "cs2"]) // clip_slots

      // ClipSlot 1
      .mockReturnValueOnce([0]) // has_clip

      // ClipSlot 2
      .mockReturnValueOnce([1]) // has_clip
      .mockReturnValueOnce(["id", "clip1"]) // clip

      // Clip 1
      .mockReturnValueOnce(["MIDI Clip"]) // name
      .mockReturnValueOnce([65280]) // color
      .mockReturnValueOnce([1]) // is_midi_clip
      .mockReturnValueOnce([0]) // is_arrangement_clip
      .mockReturnValueOnce([4]) // length
      .mockReturnValueOnce([0]) // start_time
      .mockReturnValueOnce([4]) // end_time
      .mockReturnValueOnce([0]) // start_marker
      .mockReturnValueOnce([4]) // end_marker
      .mockReturnValueOnce([1]) // looping
      .mockReturnValueOnce([0]) // loop_start
      .mockReturnValueOnce([4]) // loop_end

      // Track 2 properties
      .mockReturnValueOnce(["Audio Track"]) // name
      .mockReturnValueOnce([16711680]) // color
      .mockReturnValueOnce([0]) // has_midi_input
      .mockReturnValueOnce([1]) // mute
      .mockReturnValueOnce([1]) // solo
      .mockReturnValueOnce([0]) // arm
      .mockReturnValueOnce(["id", "cs3"]) // clip_slots

      // ClipSlot 3
      .mockReturnValueOnce([1]) // has_clip
      .mockReturnValueOnce(["id", "clip2"]) // clip

      // Clip 2
      .mockReturnValueOnce(["Audio Clip"]) // name
      .mockReturnValueOnce([255]) // color
      .mockReturnValueOnce([0]) // is_midi_clip
      .mockReturnValueOnce([1]) // is_arrangement_clip
      .mockReturnValueOnce([8]) // length
      .mockReturnValueOnce([2]) // start_time
      .mockReturnValueOnce([10]) // end_time
      .mockReturnValueOnce([2]) // start_marker
      .mockReturnValueOnce([10]) // end_marker
      .mockReturnValueOnce([0]) // looping
      .mockReturnValueOnce([2]) // loop_start
      .mockReturnValueOnce([10]); // loop_end

    const { listTracks } = require("./list-tracks");
    const result = listTracks();

    // Test track count
    expect(result.length).toBe(2);

    // Test first track
    expect(result[0].name).toBe("MIDI Track");
    expect(result[0].type).toBe("midi");
    expect(result[0].index).toBe(0);
    expect(result[0].isMuted).toBe(false);
    expect(result[0].isSoloed).toBe(false);
    expect(result[0].isArmed).toBe(true);
    expect(result[0].color).toBe("#505050");

    // Test second track
    expect(result[1].name).toBe("Audio Track");
    expect(result[1].type).toBe("audio");
    expect(result[1].index).toBe(1);
    expect(result[1].isMuted).toBe(true);
    expect(result[1].isSoloed).toBe(true);
    expect(result[1].isArmed).toBe(false);
    expect(result[1].color).toBe("#FF0000");

    // Test clip counts
    expect(result[0].clips.length).toBe(1);
    expect(result[1].clips.length).toBe(1);

    // Test MIDI clip
    const midiClip = result[0].clips[0];
    expect(midiClip.name).toBe("MIDI Clip");
    expect(midiClip.type).toBe("midi");
    expect(midiClip.slotIndex).toBe(1);
    expect(midiClip.location).toBe("session");
    expect(midiClip.length).toBe(4);
    expect(midiClip.isLooping).toBe(true);

    // Test Audio clip
    const audioClip = result[1].clips[0];
    expect(audioClip.name).toBe("Audio Clip");
    expect(audioClip.type).toBe("audio");
    expect(audioClip.slotIndex).toBe(0);
    expect(audioClip.location).toBe("arrangement");
    expect(audioClip.length).toBe(8);
    expect(audioClip.isLooping).toBe(false);
  });
});
