// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { cleanupTempClip, extendSongIfNeeded } from "../song-extension.ts";

vi.mock(
  import("#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    createAudioClipInSession: vi.fn(),
  }),
);

import { createAudioClipInSession } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";

const g = globalThis as Record<string, unknown>;

function mockLiveSetWithTracks(trackIds: string[] = ["track-1"]): LiveAPI {
  return {
    getProperty: vi.fn().mockReturnValue(100),
    getChildIds: vi.fn().mockReturnValue(trackIds),
  } as unknown as LiveAPI;
}

/**
 * A track's getProperty: the given values, 0 for any other property.
 * @param props - Property values by name
 * @returns A getProperty mock
 */
function trackProps(props: Record<string, number>): Mock {
  return vi.fn((name: string) => props[name] ?? 0);
}

/**
 * Answer `LiveAPI.from` with these objects, and null for any other id.
 * @param objectsById - The object each id resolves to
 */
function mockLiveApiFrom(objectsById: Record<string, unknown>): void {
  g.LiveAPI = {
    from: vi.fn((id: string) => objectsById[id] ?? null),
  };
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
        getProperty: trackProps({ has_midi_input: 1 }),
        call: vi.fn().mockReturnValue("id 999"),
      };

      mockLiveApiFrom({
        "track-1": mockMidiTrack,
        "id 999": { id: "999", exists: () => true, type: "Clip" },
      });

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
      const { mockMidiTrack, mockTempClip } = midiTrackCreatingClip999();

      mockLiveApiFrom({ "track-1": mockMidiTrack, "id 999": mockTempClip });

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
        getProperty: trackProps({ has_midi_input: 1 }),
        call: vi.fn().mockReturnValue("id 1"),
      };
      const mockLiveSetObject = {
        id: "1",
        exists: () => true,
        type: "LiveSet",
      };

      mockLiveApiFrom({ "track-1": mockMidiTrack, "id 1": mockLiveSetObject });

      const mockLiveSet = mockLiveSetWithTracks();

      expect(() => extendSongIfNeeded(mockLiveSet, 200, {})).toThrow(
        /Live created no clip/,
      );
    });

    it("should create audio clip when only audio tracks available", () => {
      const mockAudioTrack = {
        getProperty: trackProps({ has_midi_input: 0 }),
        call: vi.fn().mockReturnValue("id 888"),
      };
      const mockSessionClip = { id: "777" };
      const mockSlot = { call: vi.fn() };
      const mockArrangementClip = { id: "888" };

      (createAudioClipInSession as Mock).mockReturnValue({
        clip: mockSessionClip,
        slot: mockSlot,
      });

      mockLiveApiFrom({
        "track-1": mockAudioTrack,
        "id 888": mockArrangementClip,
      });

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
        getProperty: trackProps({ has_midi_input: 0 }),
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
        getProperty: trackProps({ has_midi_input: 0 }),
      };
      const { mockMidiTrack, mockTempClip } = midiTrackCreatingClip999();

      mockLiveApiFrom({
        "audio-track": mockAudioTrack,
        "midi-track": mockMidiTrack,
        "id 999": mockTempClip,
      });

      const mockLiveSet = mockLiveSetWithTracks(["audio-track", "midi-track"]);

      const result = extendSongIfNeeded(mockLiveSet, 200, {});

      // Should use MIDI track even though audio was first
      expect(result!.isMidiTrack).toBe(true);
      expect(result!.track).toBe(mockMidiTrack);
    });

    describe("tracks that can't take a clip", () => {
      it.each([
        ["frozen", { has_midi_input: 1, is_frozen: 1 }],
        ["a group", { has_midi_input: 1, is_foldable: 1 }],
      ])("skips a MIDI track that is %s", (_what, props) => {
        const { mockMidiTrack, mockTempClip } = midiTrackCreatingClip999();
        const blocked = { getProperty: trackProps(props), call: vi.fn() };

        mockLiveApiFrom({
          blocked,
          "midi-track": mockMidiTrack,
          "id 999": mockTempClip,
        });

        const result = extendSongIfNeeded(
          mockLiveSetWithTracks(["blocked", "midi-track"]),
          200,
          {},
        );

        expect(result!.track).toBe(mockMidiTrack);
        expect(blocked.call).not.toHaveBeenCalled();
      });

      it("skips a frozen audio track when picking the audio fallback", () => {
        const frozen = { getProperty: trackProps({ is_frozen: 1 }) };
        const audio = {
          getProperty: trackProps({ has_midi_input: 0 }),
          call: vi.fn().mockReturnValue("id 888"),
        };

        (createAudioClipInSession as Mock).mockReturnValue({
          clip: { id: "777" },
          slot: { call: vi.fn() },
        });
        mockLiveApiFrom({ frozen, audio, "id 888": { id: "888" } });

        const result = extendSongIfNeeded(
          mockLiveSetWithTracks(["frozen", "audio"]),
          200,
          { silenceWavPath: "/path/to/silence.wav" },
        );

        expect(result!.track).toBe(audio);
        expect(createAudioClipInSession).toHaveBeenCalledWith(
          audio,
          1,
          "/path/to/silence.wav",
        );
      });

      it("throws the no-tracks error when every track is frozen or a group", () => {
        mockLiveApiFrom({
          frozen: {
            getProperty: trackProps({ has_midi_input: 1, is_frozen: 1 }),
          },
          group: { getProperty: trackProps({ is_foldable: 1 }) },
        });

        expect(() =>
          extendSongIfNeeded(
            mockLiveSetWithTracks(["frozen", "group"]),
            200,
            {},
          ),
        ).toThrow(
          "Cannot create locator past song end: no tracks available to extend song",
        );
      });
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

    it("removes the scene made for the audio clip with it", () => {
      const mockTrack = { call: vi.fn() } as unknown as LiveAPI;
      const mockSlot = { call: vi.fn() } as unknown as LiveAPI;
      const mockSceneCall = vi.fn();
      const mockSceneLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id 1", "id 2"]),
        call: mockSceneCall,
      };

      mockLiveApiFrom({ [livePath.liveSet]: mockSceneLiveSet });

      cleanupTempClip({
        track: mockTrack,
        clipId: "456",
        isMidiTrack: false,
        slot: mockSlot,
        sceneId: "id 2",
      });

      expect(mockSceneCall).toHaveBeenCalledExactlyOnceWith("delete_scene", 1);
    });

    it("still removes the session clip and scene when the arrangement clip won't go", () => {
      const mockTrack = {
        call: vi.fn(() => {
          throw new Error("track says no");
        }),
      } as unknown as LiveAPI;
      const mockSlot = { call: vi.fn() } as unknown as LiveAPI;
      const mockSceneCall = vi.fn();
      const report = vi.fn();

      mockLiveApiFrom({
        [livePath.liveSet]: {
          getChildIds: vi.fn().mockReturnValue(["id 1", "id 2"]),
          call: mockSceneCall,
        },
      });

      expect(() =>
        cleanupTempClip(
          {
            track: mockTrack,
            clipId: "456",
            isMidiTrack: false,
            slot: mockSlot,
            sceneId: "id 2",
          },
          report,
        ),
      ).not.toThrow();

      expect(report).toHaveBeenCalledExactlyOnceWith(
        "couldn't remove the temp arrangement clip (track says no)",
      );
      expect(mockSlot.call).toHaveBeenCalledWith("delete_clip");
      expect(mockSceneCall).toHaveBeenCalledExactlyOnceWith("delete_scene", 1);
    });

    it("reports a session clip that won't go, and still tries the scene", () => {
      const mockTrack = { call: vi.fn() } as unknown as LiveAPI;
      const mockSlot = {
        call: vi.fn(() => {
          throw new Error("slot says no");
        }),
      } as unknown as LiveAPI;
      const mockSceneCall = vi.fn();
      const report = vi.fn();

      mockLiveApiFrom({
        [livePath.liveSet]: {
          getChildIds: vi.fn().mockReturnValue(["id 2"]),
          call: mockSceneCall,
        },
      });

      cleanupTempClip(
        {
          track: mockTrack,
          clipId: "456",
          isMidiTrack: false,
          slot: mockSlot,
          sceneId: "id 2",
        },
        report,
      );

      expect(report).toHaveBeenCalledExactlyOnceWith(
        "couldn't remove the scratch session clip (slot says no)",
      );
      expect(mockSceneCall).toHaveBeenCalledExactlyOnceWith("delete_scene", 0);
    });

    it("reports a scene that won't go", () => {
      const mockTrack = { call: vi.fn() } as unknown as LiveAPI;
      const mockSlot = { call: vi.fn() } as unknown as LiveAPI;
      const report = vi.fn();

      mockLiveApiFrom({
        [livePath.liveSet]: {
          getChildIds: vi.fn().mockReturnValue(["id 2"]),
          call: vi.fn(() => {
            throw new Error("scene says no");
          }),
        },
      });

      cleanupTempClip(
        {
          track: mockTrack,
          clipId: "456",
          isMidiTrack: false,
          slot: mockSlot,
          sceneId: "id 2",
        },
        report,
      );

      expect(report).toHaveBeenCalledExactlyOnceWith(
        "left an empty scene behind: couldn't remove the scratch scene (scene says no)",
      );
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

/**
 * A MIDI track whose create_midi_clip hands back clip 999, and that clip.
 * @returns The track and the clip it creates
 */
function midiTrackCreatingClip999(): {
  mockMidiTrack: { getProperty: Mock; call: Mock };
  mockTempClip: { id: string; exists: () => boolean; type: string };
} {
  return {
    mockMidiTrack: {
      getProperty: trackProps({ has_midi_input: 1 }),
      call: vi.fn().mockReturnValue("id 999"),
    },
    mockTempClip: { id: "999", exists: () => true, type: "Clip" },
  };
}
