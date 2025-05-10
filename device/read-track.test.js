// device/read-track.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock LiveAPI class that properly tracks instances
class MockLiveAPI {
  constructor(path) {
    this.path = path;
    this.unquotedpath = path;
    this.id = "id 1";

    // Create bound version of get that has access to this instance
    this.get = (prop) => mockGetForPath(this.path, prop);
  }
}

// Function to handle get calls based on path
let mockGetForPath = () => [0];

// Setup for tests
beforeEach(() => {
  vi.stubGlobal("LiveAPI", MockLiveAPI);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Import module under test
const { readTrack } = require("./read-track");

describe("readTrack", () => {
  it("should return track information for a valid track without drum rack", () => {
    // Setup mock implementation - track with no devices
    mockGetForPath = (path, prop) => {
      if (path === "live_set tracks 0") {
        const values = {
          name: ["Track 1"],
          color: [16711680], // Red: 0xFF0000
          has_midi_input: [1],
          devices: [], // No devices
          mute: [0],
          solo: [0],
          arm: [1],
          is_foldable: [0],
          is_grouped: [0],
          fold_state: [0],
          is_visible: [1],
          can_be_armed: [1],
          can_be_frozen: [1],
          can_show_chains: [0],
          is_showing_chains: [0],
          is_frozen: [0],
          muted_via_solo: [0],
          back_to_arranger: [0],
          has_audio_input: [0],
          has_audio_output: [1],
          has_midi_input: [1],
          has_midi_output: [0],
          playing_slot_index: [2],
          fired_slot_index: [-1],
        };
        return values[prop] || [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.trackIndex).toBe(0);
    expect(result.name).toBe("Track 1");
    expect(result.type).toBe("midi");
    expect(result.color).toBe("#FF0000");
    expect(result.isArmed).toBe(true);
    expect(result.drumPads).toBeNull();
  });

  it("should detect drum pads on a track with drum rack", () => {
    // Setup mock for track with drum rack
    mockGetForPath = (path, prop) => {
      switch (path) {
        case "live_set tracks 0":
          if (prop === "devices") return ["id", "device_1"];
          if (prop === "name") return ["Drum Track"];
          if (prop === "has_midi_input") return [1];
          if (prop === "color") return [0];
          return [0];
        case "id device_1":
          if (prop === "type") return [1]; // DEVICE_TYPE_INSTRUMENT
          if (prop === "can_have_drum_pads") return [1];
          if (prop === "drum_pads") return ["id", "pad_1", "id", "pad_2", "id", "pad_3"];
          return [0];
        case "id pad_1":
          if (prop === "chains") return [[1]]; // Has chains
          if (prop === "note") return [36]; // Kick
          if (prop === "name") return ["Kick"];
          return [0];
        case "id pad_2":
          if (prop === "chains") return [[1]]; // Has chains
          if (prop === "note") return [38]; // Snare
          if (prop === "name") return ["Snare"];
          return [0];
        case "id pad_3":
          if (prop === "chains") return []; // No chains, should be filtered out
          return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.drumPads).toEqual([
      { pitch: 36, name: "Kick" },
      { pitch: 38, name: "Snare" },
    ]);
  });

  it("should return null for drum pads when track has non-drum instruments", () => {
    // Track has an instrument but it's not a drum rack
    mockGetForPath = (path, prop) => {
      switch (path) {
        case "live_set tracks 0":
          if (prop === "devices") return ["id", "device_1"];
          if (prop === "name") return ["Wavetable Track"];
          if (prop === "has_midi_input") return [1];
          return [0];
        case "id device_1":
          if (prop === "type") return [1]; // DEVICE_TYPE_INSTRUMENT
          if (prop === "can_have_drum_pads") return [0]; // Not a drum rack
          return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.drumPads).toBeNull();
  });

  it("should return null for drum pads when track has no instruments", () => {
    // Track has only effects, no instruments
    mockGetForPath = (path, prop) => {
      switch (path) {
        case "live_set tracks 0":
          if (prop === "devices") return ["id", "device_1"];
          if (prop === "name") return ["Audio Track"];
          if (prop === "has_midi_input") return [0];
          return [0];
        case "id device_1":
          if (prop === "type") return [2]; // DEVICE_TYPE_AUDIO_EFFECT
          return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.drumPads).toBeNull();
  });

  it("should find drum rack when multiple devices are present", () => {
    // Track with multiple devices, drum rack is second
    mockGetForPath = (path, prop) => {
      switch (path) {
        case "live_set tracks 0":
          if (prop === "devices") return ["id", "device_1", "id", "device_2", "id", "device_3"];
          if (prop === "name") return ["Multi Device Track"];
          if (prop === "has_midi_input") return [1];
          return [0];
        case "id device_1":
          if (prop === "type") return [2]; // Audio effect
          return [0];
        case "id device_2":
          if (prop === "type") return [1]; // Instrument
          if (prop === "can_have_drum_pads") return [1]; // Drum rack
          if (prop === "drum_pads") return ["id", "pad_1"];
          return [0];
        case "id device_3":
          if (prop === "type") return [2]; // Audio effect
          return [0];
        case "id pad_1":
          if (prop === "chains") return [[1]];
          if (prop === "note") return [60];
          if (prop === "name") return ["C3"];
          return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.drumPads).toEqual([{ pitch: 60, name: "C3" }]);
  });

  it("should filter out pads without chains", () => {
    mockGetForPath = (path, prop) => {
      switch (path) {
        case "live_set tracks 0":
          if (prop === "devices") return ["id", "device_1"];
          if (prop === "name") return ["Sparse Drum Rack"];
          if (prop === "has_midi_input") return [1];
          return [0];
        case "id device_1":
          if (prop === "type") return [1];
          if (prop === "can_have_drum_pads") return [1];
          if (prop === "drum_pads") return ["id", "pad_1", "id", "pad_2"];
          return [0];
        case "id pad_1":
          if (prop === "chains") return []; // No chains
          return [0];
        case "id pad_2":
          if (prop === "chains") return [[1]]; // Has chains
          if (prop === "note") return [42];
          if (prop === "name") return ["Hi-Hat"];
          return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.drumPads).toEqual([{ pitch: 42, name: "Hi-Hat" }]);
  });

  it("should maintain existing track properties when drum pads are added", () => {
    // Test that drum pads don't interfere with other track properties
    mockGetForPath = (path, prop) => {
      switch (path) {
        case "live_set tracks 0":
          if (prop === "devices") return ["id", "device_1"];
          if (prop === "name") return ["Test Track"];
          if (prop === "has_midi_input") return [1];
          if (prop === "mute") return [1];
          if (prop === "solo") return [1];
          if (prop === "arm") return [1];
          if (prop === "color") return [255]; // Blue
          return [0];
        case "id device_1":
          if (prop === "type") return [1];
          if (prop === "can_have_drum_pads") return [1];
          if (prop === "drum_pads") return [];
          return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.name).toBe("Test Track");
    expect(result.isMuted).toBe(true);
    expect(result.isSoloed).toBe(true);
    expect(result.isArmed).toBe(true);
    expect(result.color).toBe("#0000FF");
    expect(result.drumPads).toEqual([]);
  });

  it("should return error for non-existent track", () => {
    // Mock non-existent track
    vi.stubGlobal(
      "LiveAPI",
      class extends MockLiveAPI {
        constructor(path) {
          super(path);
          this.id = "id 0"; // Non-existent track
        }
      }
    );

    const result = readTrack({ trackIndex: 99 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Track at index 99 does not exist");
  });

  it("should identify audio tracks correctly", () => {
    mockGetForPath = (path, prop) => {
      if (path === "live_set tracks 1") {
        if (prop === "has_midi_input") return [0]; // Audio track
        if (prop === "has_audio_input") return [1];
        return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 1 });

    expect(result.type).toBe("audio");
    expect(result.hasAudioInput).toBe(true);
    expect(result.hasMidiInput).toBe(false);
  });

  it("should identify group tracks correctly", () => {
    mockGetForPath = (path, prop) => {
      if (path === "live_set tracks 2") {
        if (prop === "is_foldable") return [1];
        if (prop === "fold_state") return [1];
        if (prop === "is_grouped") return [0];
        return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 2 });

    expect(result.isGroup).toBe(true);
    expect(result.isFolded).toBe(true);
    expect(result.isGrouped).toBe(false);
  });

  it("should identify grouped tracks correctly", () => {
    mockGetForPath = (path, prop) => {
      if (path === "live_set tracks 3") {
        if (prop === "is_grouped") return [1];
        if (prop === "is_foldable") return [0];
        if (prop === "is_visible") return [0]; // Hidden in folded group
        return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 3 });

    expect(result.isGrouped).toBe(true);
    expect(result.isGroup).toBe(false);
    expect(result.isVisible).toBe(false);
  });

  it("should detect frozen tracks", () => {
    mockGetForPath = (path, prop) => {
      if (path === "live_set tracks 4") {
        if (prop === "is_frozen") return [1];
        if (prop === "can_be_frozen") return [1];
        return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 4 });

    expect(result.isFrozen).toBe(true);
    expect(result.canBeFrozen).toBe(true);
  });

  it("should detect muted via solo state", () => {
    mockGetForPath = (path, prop) => {
      if (path === "live_set tracks 5") {
        if (prop === "muted_via_solo") return [1];
        if (prop === "mute") return [0];
        if (prop === "solo") return [0];
        return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 5 });

    expect(result.mutedViaSolo).toBe(true);
    expect(result.isMuted).toBe(false);
    expect(result.isSoloed).toBe(false);
  });

  it("should detect tracks with chain capability", () => {
    mockGetForPath = (path, prop) => {
      if (path === "live_set tracks 6") {
        if (prop === "can_show_chains") return [1];
        if (prop === "is_showing_chains") return [1];
        return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 6 });

    expect(result.canShowChains).toBe(true);
    expect(result.isShowingChains).toBe(true);
  });

  it("should detect track playback states", () => {
    mockGetForPath = (path, prop) => {
      if (path === "live_set tracks 7") {
        if (prop === "playing_slot_index") return [2]; // Playing slot 2
        if (prop === "fired_slot_index") return [3]; // Slot 3 triggered
        return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 7 });

    expect(result.playingSlotIndex).toBe(2);
    expect(result.firedSlotIndex).toBe(3);
    expect(result.isPlaying).toBe(true);
    expect(result.isTriggered).toBe(true);
  });

  it("should detect stopped track state", () => {
    mockGetForPath = (path, prop) => {
      if (path === "live_set tracks 8") {
        if (prop === "playing_slot_index") return [-1]; // Nothing playing
        if (prop === "fired_slot_index") return [-1]; // Nothing triggered
        return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 8 });

    expect(result.playingSlotIndex).toBe(-1);
    expect(result.firedSlotIndex).toBe(-1);
    expect(result.isPlaying).toBe(false);
    expect(result.isTriggered).toBe(false);
  });

  it("should detect clip stop triggered state", () => {
    mockGetForPath = (path, prop) => {
      if (path === "live_set tracks 9") {
        if (prop === "playing_slot_index") return [1]; // Playing slot 1
        if (prop === "fired_slot_index") return [2]; // Clip Stop triggered
        return [0];
      }
      return [0];
    };

    const result = readTrack({ trackIndex: 9 });

    expect(result.playingSlotIndex).toBe(1);
    expect(result.firedSlotIndex).toBe(2);
    expect(result.isPlaying).toBe(true);
    expect(result.isTriggered).toBe(true);
  });
});
