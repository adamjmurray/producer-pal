// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanupTempClip, extendSongIfNeeded } from "../song-extension.ts";

vi.mock(
  import("#src/tools/shared/arrangement/helpers/arrangement-tiling-helpers.ts"),
  () => ({
    createAudioClipInSession: vi.fn(),
  }),
);

import { createAudioClipInSession } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-helpers.ts";

const g = globalThis as Record<string, unknown>;

function mockLiveSetWithTracks(trackIds: string[] = ["track-1"]): LiveAPI {
  return {
    getProperty: vi.fn().mockReturnValue(100),
    getChildIds: vi.fn().mockReturnValue(trackIds),
  } as unknown as LiveAPI;
}

describe("song-extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extendSongIfNeeded", () => {
    it("should return null if targetBeats is within song_length", () => {
      const mockLiveSet = {
        getProperty: vi.fn().mockReturnValue(1000), // song_length = 1000
      } as unknown as LiveAPI;

      const result = extendSongIfNeeded(mockLiveSet, 500, {});

      expect(result).toBeNull();
      expect(mockLiveSet.getProperty).toHaveBeenCalledWith("song_length");
    });

    it("should return null when targetBeats equals song_length (boundary)", () => {
      // Boundary: targetBeats === song_length needs no extension (<= not <).
      const mockLiveSet = {
        getProperty: vi.fn().mockReturnValue(1000),
        getChildIds: vi.fn().mockReturnValue([]),
      } as unknown as LiveAPI;

      expect(extendSongIfNeeded(mockLiveSet, 1000, {})).toBeNull();
    });

    it("should throw error if no tracks available", () => {
      const mockLiveSet = mockLiveSetWithTracks([]);

      expect(() => extendSongIfNeeded(mockLiveSet, 200, {})).toThrow(
        "Cannot create locator past song end: no tracks available to extend song",
      );
    });

    it("reads the track list by the 'tracks' child name", () => {
      const mockMidiTrack = {
        getProperty: vi.fn().mockReturnValue(1), // has_midi_input = 1
        call: vi.fn().mockReturnValue("id 999"),
      };

      g.LiveAPI = {
        from: vi
          .fn()
          .mockImplementation((id) =>
            id === "track-1"
              ? mockMidiTrack
              : { id: "999", exists: () => true, type: "Clip" },
          ),
      };

      const mockLiveSet = {
        getProperty: vi.fn().mockReturnValue(100), // song_length 100 < 200
        getChildIds: vi.fn((name: string) =>
          name === "tracks" ? ["track-1"] : [],
        ),
      } as unknown as LiveAPI;

      // A wrong child name yields no tracks → the "no tracks available" throw.
      expect(extendSongIfNeeded(mockLiveSet, 200, {})?.isMidiTrack).toBe(true);
    });

    it("should create MIDI clip when MIDI track is available", () => {
      const mockMidiTrack = {
        getProperty: vi.fn().mockReturnValue(1), // has_midi_input = 1
        call: vi.fn().mockReturnValue("id 999"),
      };
      const mockTempClip = { id: "999", exists: () => true, type: "Clip" };

      g.LiveAPI = {
        from: vi.fn().mockImplementation((id) => {
          if (id === "track-1") {
            return mockMidiTrack;
          }

          if (id === "id 999") {
            return mockTempClip;
          }

          return null;
        }),
      };

      const mockLiveSet = mockLiveSetWithTracks();

      const result = extendSongIfNeeded(mockLiveSet, 200, {});

      expect(result).toStrictEqual({
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

    it("throws when create_midi_clip answers with something that is not a clip", () => {
      // A refused create_midi_clip answers with the Live Set (id 1), never
      // undefined — an unchecked id here would poison the returned clipId.
      const mockMidiTrack = {
        getProperty: vi.fn().mockReturnValue(1),
        call: vi.fn().mockReturnValue("id 1"),
      };
      const mockLiveSetObject = {
        id: "1",
        exists: () => true,
        type: "LiveSet",
      };

      g.LiveAPI = {
        from: vi.fn().mockImplementation((id) => {
          if (id === "track-1") {
            return mockMidiTrack;
          }

          if (id === "id 1") {
            return mockLiveSetObject;
          }

          return null;
        }),
      };

      const mockLiveSet = mockLiveSetWithTracks();

      expect(() => extendSongIfNeeded(mockLiveSet, 200, {})).toThrow(
        /Live created no clip/,
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

      (createAudioClipInSession as Mock).mockReturnValue({
        clip: mockSessionClip,
        slot: mockSlot,
      });

      g.LiveAPI = {
        from: vi.fn().mockImplementation((id) => {
          if (id === "track-1") {
            return mockAudioTrack;
          }

          if (id === "id 888") {
            return mockArrangementClip;
          }

          return null;
        }),
      };

      const mockLiveSet = mockLiveSetWithTracks();

      const result = extendSongIfNeeded(mockLiveSet, 200, {
        silenceWavPath: "/path/to/silence.wav",
      });

      expect(result).toStrictEqual({
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

      g.LiveAPI = {
        from: vi.fn().mockReturnValue(mockAudioTrack),
      };

      const mockLiveSet = mockLiveSetWithTracks();

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
      const mockTempClip = { id: "999", exists: () => true, type: "Clip" };

      g.LiveAPI = {
        from: vi.fn().mockImplementation((id) => {
          if (id === "audio-track") {
            return mockAudioTrack;
          }

          if (id === "midi-track") {
            return mockMidiTrack;
          }

          if (id === "id 999") {
            return mockTempClip;
          }

          return null;
        }),
      };

      const mockLiveSet = mockLiveSetWithTracks(["audio-track", "midi-track"]);

      const result = extendSongIfNeeded(mockLiveSet, 200, {});

      // Should use MIDI track even though audio was first
      expect(result!.isMidiTrack).toBe(true);
      expect(result!.track).toBe(mockMidiTrack);
    });
  });

  describe("cleanupTempClip", () => {
    it("should do nothing if tempClipInfo is null", () => {
      // Should not throw
      expect(() => cleanupTempClip(null)).not.toThrow();
    });

    it("should do nothing if tempClipInfo is undefined (pass as null)", () => {
      // Should not throw - Note: function signature only accepts null, not undefined
      expect(() => cleanupTempClip(null)).not.toThrow();
    });

    it("should delete MIDI clip from arrangement", () => {
      const mockCall = vi.fn();
      const mockTrack = { call: mockCall } as unknown as LiveAPI;

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
      const mockTrack = { call: mockTrackCall } as unknown as LiveAPI;
      const mockSlot = { call: mockSlotCall } as unknown as LiveAPI;

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
      const mockTrack = { call: mockCall } as unknown as LiveAPI;

      cleanupTempClip({
        track: mockTrack,
        clipId: "789",
        isMidiTrack: false,
        slot: undefined,
      });

      expect(mockCall).toHaveBeenCalledWith("delete_clip", "id 789");
    });
  });
});
