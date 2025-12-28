import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupTempClip,
  extendSongIfNeeded,
  parseScale,
} from "./update-live-set-helpers.js";

vi.mock(import("#src/tools/shared/arrangement/arrangement-tiling.js"), () => ({
  createAudioClipInSession: vi.fn(),
}));

import { createAudioClipInSession } from "#src/tools/shared/arrangement/arrangement-tiling.js";

describe("update-live-set-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extendSongIfNeeded", () => {
    it("should return null if targetBeats is within song_length", () => {
      const mockLiveSet = {
        get: vi.fn().mockReturnValue([1000]), // song_length = 1000
      };

      const result = extendSongIfNeeded(mockLiveSet, 500, {});

      expect(result).toBeNull();
      expect(mockLiveSet.get).toHaveBeenCalledWith("song_length");
    });

    it("should throw error if no tracks available", () => {
      const mockLiveSet = {
        get: vi.fn().mockReturnValue([100]), // song_length = 100
        getChildIds: vi.fn().mockReturnValue([]),
      };

      expect(() => extendSongIfNeeded(mockLiveSet, 200, {})).toThrow(
        "Cannot create locator past song end: no tracks available to extend song",
      );
    });

    it("should create MIDI clip when MIDI track is available", () => {
      const mockMidiTrack = {
        getProperty: vi.fn().mockReturnValue(1), // has_midi_input = 1
        call: vi.fn().mockReturnValue("id 999"),
      };
      const mockTempClip = { id: "999" };

      globalThis.LiveAPI = {
        from: vi.fn().mockImplementation((id) => {
          if (id === "track-1") return mockMidiTrack;
          if (id === "id 999") return mockTempClip;
          return null;
        }),
      };

      const mockLiveSet = {
        get: vi.fn().mockReturnValue([100]),
        getChildIds: vi.fn().mockReturnValue(["track-1"]),
      };

      const result = extendSongIfNeeded(mockLiveSet, 200, {});

      expect(result).toEqual({
        track: mockMidiTrack,
        clipId: "999",
        isMidiTrack: true,
      });
      expect(mockMidiTrack.call).toHaveBeenCalledWith(
        "create_midi_clip",
        200,
        1,
      );
    });

    it("should create audio clip when only audio tracks available", () => {
      const mockAudioTrack = {
        getProperty: vi.fn().mockReturnValue(0), // has_midi_input = 0 (audio)
        call: vi.fn().mockReturnValue("id 888"),
      };
      const mockSessionClip = { id: "777" };
      const mockSlot = { call: vi.fn() };
      const mockArrangementClip = { id: "888" };

      createAudioClipInSession.mockReturnValue({
        clip: mockSessionClip,
        slot: mockSlot,
      });

      globalThis.LiveAPI = {
        from: vi.fn().mockImplementation((id) => {
          if (id === "track-1") return mockAudioTrack;
          if (id === "id 888") return mockArrangementClip;
          return null;
        }),
      };

      const mockLiveSet = {
        get: vi.fn().mockReturnValue([100]),
        getChildIds: vi.fn().mockReturnValue(["track-1"]),
      };

      const result = extendSongIfNeeded(mockLiveSet, 200, {
        silenceWavPath: "/path/to/silence.wav",
      });

      expect(result).toEqual({
        track: mockAudioTrack,
        clipId: "888",
        isMidiTrack: false,
        slot: mockSlot,
      });
      expect(createAudioClipInSession).toHaveBeenCalledWith(
        mockAudioTrack,
        1,
        "/path/to/silence.wav",
      );
      expect(mockAudioTrack.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 777",
        200,
      );
    });

    it("should throw error if audio track but no silenceWavPath", () => {
      const mockAudioTrack = {
        getProperty: vi.fn().mockReturnValue(0), // has_midi_input = 0 (audio)
      };

      globalThis.LiveAPI = {
        from: vi.fn().mockReturnValue(mockAudioTrack),
      };

      const mockLiveSet = {
        get: vi.fn().mockReturnValue([100]),
        getChildIds: vi.fn().mockReturnValue(["track-1"]),
      };

      expect(() => extendSongIfNeeded(mockLiveSet, 200, {})).toThrow(
        "Cannot create locator past song end: no MIDI tracks and silenceWavPath not available",
      );
    });

    it("should prefer MIDI track over audio track", () => {
      const mockAudioTrack = {
        getProperty: vi.fn().mockReturnValue(0), // audio track
      };
      const mockMidiTrack = {
        getProperty: vi.fn().mockReturnValue(1), // MIDI track
        call: vi.fn().mockReturnValue("id 999"),
      };
      const mockTempClip = { id: "999" };

      globalThis.LiveAPI = {
        from: vi.fn().mockImplementation((id) => {
          if (id === "audio-track") return mockAudioTrack;
          if (id === "midi-track") return mockMidiTrack;
          if (id === "id 999") return mockTempClip;
          return null;
        }),
      };

      const mockLiveSet = {
        get: vi.fn().mockReturnValue([100]),
        getChildIds: vi.fn().mockReturnValue(["audio-track", "midi-track"]),
      };

      const result = extendSongIfNeeded(mockLiveSet, 200, {});

      // Should use MIDI track even though audio was first
      expect(result.isMidiTrack).toBe(true);
      expect(result.track).toBe(mockMidiTrack);
    });
  });

  describe("cleanupTempClip", () => {
    it("should do nothing if tempClipInfo is null", () => {
      // Should not throw
      expect(() => cleanupTempClip(null)).not.toThrow();
    });

    it("should do nothing if tempClipInfo is undefined", () => {
      // Should not throw
      expect(() => cleanupTempClip(undefined)).not.toThrow();
    });

    it("should delete MIDI clip from arrangement", () => {
      const mockCall = vi.fn();
      const mockTrack = { call: mockCall };

      cleanupTempClip({
        track: mockTrack,
        clipId: "123",
        isMidiTrack: true,
      });

      expect(mockCall).toHaveBeenCalledWith("delete_clip", "id 123");
    });

    it("should delete audio clip from both arrangement and session", () => {
      const mockTrackCall = vi.fn();
      const mockSlotCall = vi.fn();
      const mockTrack = { call: mockTrackCall };
      const mockSlot = { call: mockSlotCall };

      cleanupTempClip({
        track: mockTrack,
        clipId: "456",
        isMidiTrack: false,
        slot: mockSlot,
      });

      expect(mockTrackCall).toHaveBeenCalledWith("delete_clip", "id 456");
      expect(mockSlotCall).toHaveBeenCalledWith("delete_clip");
    });

    it("should handle audio clip without slot gracefully", () => {
      const mockCall = vi.fn();
      const mockTrack = { call: mockCall };

      cleanupTempClip({
        track: mockTrack,
        clipId: "789",
        isMidiTrack: false,
        slot: null,
      });

      expect(mockCall).toHaveBeenCalledWith("delete_clip", "id 789");
    });
  });

  describe("parseScale", () => {
    it("should parse valid scale string", () => {
      const result = parseScale("C Major");
      expect(result).toEqual({ scaleRoot: "C", scaleName: "Major" });
    });

    it("should handle case-insensitive root notes", () => {
      const result = parseScale("f# minor");
      expect(result).toEqual({ scaleRoot: "F#", scaleName: "Minor" });
    });

    it("should handle Bb (flat notation)", () => {
      const result = parseScale("Bb Dorian");
      expect(result).toEqual({ scaleRoot: "Bb", scaleName: "Dorian" });
    });

    it("should handle extra whitespace", () => {
      const result = parseScale("  D   Mixolydian  ");
      expect(result).toEqual({ scaleRoot: "D", scaleName: "Mixolydian" });
    });

    it("should throw for invalid format - single word", () => {
      expect(() => parseScale("CMajor")).toThrow(
        "Scale must be in format 'Root ScaleName'",
      );
    });

    it("should throw for invalid root note", () => {
      expect(() => parseScale("X Major")).toThrow("Invalid scale root 'X'");
    });

    it("should throw for invalid scale name", () => {
      expect(() => parseScale("C InvalidScale")).toThrow(
        "Invalid scale name 'InvalidScale'",
      );
    });
  });
});
