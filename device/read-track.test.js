// device/read-track.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Setup mock implementation
const mockLiveApiGet = vi.fn();

// Mock LiveAPI class
class MockLiveAPI {
  constructor(path) {
    this.path = path;
    this.unquotedpath = path;
    this.get = mockLiveApiGet;

    // Default to valid track
    this.id = "id 1";
  }
}

// Setup for tests
beforeEach(() => {
  mockLiveApiGet.mockReset();
  vi.stubGlobal("LiveAPI", MockLiveAPI);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Import module under test
const { readTrack } = require("./read-track");

describe("readTrack", () => {
  it("should return track information for a valid track", () => {
    // Setup mock implementation
    mockLiveApiGet.mockImplementation((prop) => {
      const values = {
        name: ["Track 1"],
        color: [16711680], // Red: 0xFF0000
        has_midi_input: [1],
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
    });

    const result = readTrack({ trackIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.trackIndex).toBe(0);
    expect(result.name).toBe("Track 1");
    expect(result.type).toBe("midi");
    expect(result.color).toBe("#FF0000");
    expect(result.isArmed).toBe(true);
    expect(result.canBeArmed).toBe(true);
    expect(result.hasAudioOutput).toBe(true);
    expect(result.hasMidiInput).toBe(true);
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
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "has_midi_input") return [0]; // Audio track
      if (prop === "has_audio_input") return [1];
      return [0];
    });

    const result = readTrack({ trackIndex: 1 });

    expect(result.type).toBe("audio");
    expect(result.hasAudioInput).toBe(true);
    expect(result.hasMidiInput).toBe(false);
  });

  it("should identify group tracks correctly", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "is_foldable") return [1];
      if (prop === "fold_state") return [1];
      if (prop === "is_grouped") return [0];
      return [0];
    });

    const result = readTrack({ trackIndex: 2 });

    expect(result.isGroup).toBe(true);
    expect(result.isFolded).toBe(true);
    expect(result.isGrouped).toBe(false);
  });

  it("should identify grouped tracks correctly", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "is_grouped") return [1];
      if (prop === "is_foldable") return [0];
      if (prop === "is_visible") return [0]; // Hidden in folded group
      return [0];
    });

    const result = readTrack({ trackIndex: 3 });

    expect(result.isGrouped).toBe(true);
    expect(result.isGroup).toBe(false);
    expect(result.isVisible).toBe(false);
  });

  it("should detect frozen tracks", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "is_frozen") return [1];
      if (prop === "can_be_frozen") return [1];
      return [0];
    });

    const result = readTrack({ trackIndex: 4 });

    expect(result.isFrozen).toBe(true);
    expect(result.canBeFrozen).toBe(true);
  });

  it("should detect muted via solo state", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "muted_via_solo") return [1];
      if (prop === "mute") return [0];
      if (prop === "solo") return [0];
      return [0];
    });

    const result = readTrack({ trackIndex: 5 });

    expect(result.mutedViaSolo).toBe(true);
    expect(result.isMuted).toBe(false);
    expect(result.isSoloed).toBe(false);
  });

  it("should detect tracks with chain capability", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "can_show_chains") return [1];
      if (prop === "is_showing_chains") return [1];
      return [0];
    });

    const result = readTrack({ trackIndex: 6 });

    expect(result.canShowChains).toBe(true);
    expect(result.isShowingChains).toBe(true);
  });

  it("should detect track playback states", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "playing_slot_index") return [2]; // Playing slot 2
      if (prop === "fired_slot_index") return [3]; // Slot 3 triggered
      return [0];
    });

    const result = readTrack({ trackIndex: 7 });

    expect(result.playingSlotIndex).toBe(2);
    expect(result.firedSlotIndex).toBe(3);
    expect(result.isPlaying).toBe(true);
    expect(result.isTriggered).toBe(true);
  });

  it("should detect stopped track state", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "playing_slot_index") return [-1]; // Nothing playing
      if (prop === "fired_slot_index") return [-1]; // Nothing triggered
      return [0];
    });

    const result = readTrack({ trackIndex: 8 });

    expect(result.playingSlotIndex).toBe(-1);
    expect(result.firedSlotIndex).toBe(-1);
    expect(result.isPlaying).toBe(false);
    expect(result.isTriggered).toBe(false);
  });

  it("should detect clip stop triggered state", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "playing_slot_index") return [1]; // Playing slot 1
      if (prop === "fired_slot_index") return [2]; // Clip Stop triggered
      return [0];
    });

    const result = readTrack({ trackIndex: 9 });

    expect(result.playingSlotIndex).toBe(1);
    expect(result.firedSlotIndex).toBe(2);
    expect(result.isPlaying).toBe(true);
    expect(result.isTriggered).toBe(true);
  });
});
