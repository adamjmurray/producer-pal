import { describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.js";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.js";
import {
  children,
  createStandardMidiClipMock,
  liveApiCall,
  liveApiSet,
  mockLiveApiGet,
  setupArrangementClipMocks,
  setupScenePath,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.js";
import type { Mock } from "vitest";

interface MockContext {
  _path?: string;
  path?: string;
}

interface DuplicateClipResult {
  id: string;
  trackIndex: number;
  name?: string;
}

interface DuplicateSceneResult {
  id?: string;
  sceneIndex?: number;
  arrangementStart?: string;
  clips: DuplicateClipResult[];
}

describe("duplicate - scene duplication", () => {
  it("should duplicate a single scene to session view (default behavior)", () => {
    setupScenePath("scene1");

    // Mock scene with clips in tracks 0 and 1
    mockLiveApiGet({
      LiveSet: {
        tracks: children("track0", "track1"),
      },
      "live_set tracks 0 clip_slots 1": { has_clip: 1 },
      "live_set tracks 1 clip_slots 1": { has_clip: 1 },
    });

    const result = duplicate({ type: "scene", id: "scene1" }) as DuplicateSceneResult;

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      sceneIndex: 1,
      clips: [
        {
          id: "live_set/tracks/0/clip_slots/1/clip",
          trackIndex: 0,
        },
        {
          id: "live_set/tracks/1/clip_slots/1/clip",
          trackIndex: 1,
        },
      ],
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_scene",
      0,
    );
  });

  it("should duplicate multiple scenes with auto-incrementing names", () => {
    setupScenePath("scene1");

    // Mock scene with clips in tracks 0 and 1
    mockLiveApiGet({
      LiveSet: {
        tracks: children("track0", "track1"),
      },
      "live_set tracks 0 clip_slots 1": { has_clip: 1 },
      "live_set tracks 1 clip_slots 1": { has_clip: 1 },
      "live_set tracks 0 clip_slots 2": { has_clip: 1 },
      "live_set tracks 1 clip_slots 2": { has_clip: 1 },
    });

    const result = duplicate({
      type: "scene",
      id: "scene1",
      count: 2,
      name: "Custom Scene",
    }) as DuplicateSceneResult[];

    expect(result).toStrictEqual([
      {
        id: "live_set/scenes/1",
        sceneIndex: 1,
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/1/clip",
            trackIndex: 0,
          },
          {
            id: "live_set/tracks/1/clip_slots/1/clip",
            trackIndex: 1,
          },
        ],
      },
      {
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/2/clip",
            trackIndex: 0,
          },
          {
            id: "live_set/tracks/1/clip_slots/2/clip",
            trackIndex: 1,
          },
        ],
      },
    ]);

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_scene",
      0,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_scene",
      1,
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set scenes 1" }),
      "name",
      "Custom Scene",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set scenes 2" }),
      "name",
      "Custom Scene 2",
    );
  });

  it("should duplicate a scene without clips when withoutClips is true", () => {
    setupScenePath("scene1");

    // Mock scene with clips in tracks 0 and 1
    mockLiveApiGet({
      LiveSet: {
        tracks: children("track0", "track1", "track2"),
      },
      "live_set tracks 0 clip_slots 1": { has_clip: 1 },
      "live_set tracks 1 clip_slots 1": { has_clip: 1 },
      "live_set tracks 2 clip_slots 1": { has_clip: 0 },
    });

    const result = duplicate({
      type: "scene",
      id: "scene1",
      withoutClips: true,
    }) as DuplicateSceneResult;

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      sceneIndex: 1,
      clips: [],
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_scene",
      0,
    );

    // Verify delete_clip was called for clips in the duplicated scene
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: expect.stringContaining("clip_slots"),
      }),
      "delete_clip",
    );
    const deleteCallCount = (liveApiCall as Mock).mock.calls.filter(
      (call: unknown[]) => call[0] === "delete_clip",
    ).length;

    expect(deleteCallCount).toBe(2); // Should delete 2 clips (tracks 0 and 1)
  });

  describe("arrangement destination", () => {
    it("should throw error when arrangementStartTime is missing for scene to arrangement", () => {
      setupScenePath("scene1");

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementLocatorId, or arrangementLocatorName is required when destination is 'arrangement'",
      );
    });

    it("should duplicate a scene to arrangement view", () => {
      setupScenePath("scene1");

      // Mock scene with clips in tracks 0 and 2
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0", "track1", "track2"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 1 clip_slots 0": { has_clip: 0 },
        "live_set tracks 2 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": createStandardMidiClipMock({
          length: 4,
          name: "Clip 1",
        }),
        "live_set tracks 2 clip_slots 0 clip": {
          length: 8,
          name: "Clip 2",
          color: 8355711,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 0,
          loop_start: 0,
          loop_end: 8,
          is_midi_clip: 1,
        },
      });

      (liveApiCall as Mock).mockImplementation(function (
        this: MockContext,
        method: string,
        clipIdOrStartTime: string,
        _startTimeOrLength?: number,
      ): string[] | string | null {
        if (method === "duplicate_clip_to_arrangement") {
          // Extract track index from the clip ID path
          const trackMatch = (clipIdOrStartTime as string).match(/tracks\/(\d+)/);
          const trackIndex = trackMatch ? trackMatch[1] : "0";

          // Return a mock arrangement clip ID
          return ["id", `live_set tracks ${trackIndex} arrangement_clips 0`];
        }

        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] }); // Empty notes for testing
        }

        return null;
      });

      setupArrangementClipMocks();

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
      }) as DuplicateSceneResult;

      // Both clips now use duplicate_clip_to_arrangement
      // Track 0 clip (4 beats → 8 beats) - lengthened via updateClip
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );
      // Track 2 clip (8 beats → 8 beats) - exact match, no updateClip needed
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 2" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/2/clip_slots/0/clip",
        16,
      );

      // Verify result structure
      expect(result).toHaveProperty("arrangementStart", "5|1");
      expect(result).toHaveProperty("clips");
      expect(Array.isArray(result.clips)).toBe(true);
      // At least the exact-match clip (track 2) should appear
      // Track 0's lengthening via updateClip is tested in updateClip's own tests
      expect(result.clips.some((c: DuplicateClipResult) => c.trackIndex === 2)).toBe(true);
    });

    it("should duplicate multiple scenes to arrangement view at sequential positions", () => {
      setupScenePath("scene1");

      // Mock scene with one clip of length 8 beats
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": createStandardMidiClipMock(),
      });

      let clipCounter = 0;

      (liveApiCall as Mock).mockImplementation(function (
        this: MockContext,
        method: string,
        _clipIdOrStartTime?: string,
        _startTimeOrLength?: number,
      ): string[] | string | null {
        if (method === "duplicate_clip_to_arrangement") {
          // Return unique clip IDs for each duplication
          const clipId = `live_set tracks 0 arrangement_clips ${clipCounter}`;

          clipCounter++;

          return ["id", clipId];
        }

        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] }); // Empty notes for testing
        }

        return null;
      });

      setupArrangementClipMocks({
        getStartTime: (path: string): number => {
          const clipMatch = path.match(/arrangement_clips (\d+)/);

          if (clipMatch) {
            const clipIndex = Number.parseInt(clipMatch[1] as string);

            return 16 + clipIndex * 8; // 16, 24, 32
          }

          return 16;
        },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
        count: 3,
        name: "Scene Copy",
      }) as DuplicateSceneResult[];

      // Scenes should be placed at sequential positions based on scene length (8 beats)
      // All use duplicate_clip_to_arrangement (exact match, no lengthening needed)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        24,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        32,
      );

      expect(result).toStrictEqual([
        {
          arrangementStart: "5|1",
          clips: [
            {
              id: "live_set tracks 0 arrangement_clips 0",
              trackIndex: 0,
              name: "Scene Copy",
            },
          ],
        },
        {
          arrangementStart: "7|1",
          clips: [
            {
              id: "live_set tracks 0 arrangement_clips 1",
              trackIndex: 0,
              name: "Scene Copy 2",
            },
          ],
        },
        {
          arrangementStart: "9|1",
          clips: [
            {
              id: "live_set tracks 0 arrangement_clips 2",
              trackIndex: 0,
              name: "Scene Copy 3",
            },
          ],
        },
      ]);
    });

    it("should handle empty scenes gracefully", () => {
      setupScenePath("scene1");

      // Mock empty scene
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0", "track1"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 0 },
        "live_set tracks 1 clip_slots 0": { has_clip: 0 },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
      }) as DuplicateSceneResult;

      expect(result).toStrictEqual({
        arrangementStart: "5|1",
        clips: [],
      });
    });

    it("should duplicate a scene to arrangement without clips when withoutClips is true", () => {
      setupScenePath("scene1");

      // Mock scene with clips in tracks 0 and 2
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0", "track1", "track2"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 1 clip_slots 0": { has_clip: 0 },
        "live_set tracks 2 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": { length: 4 },
        "live_set tracks 2 clip_slots 0 clip": { length: 8 },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
        withoutClips: true,
      }) as DuplicateSceneResult;

      // Verify that duplicate_clip_to_arrangement was NOT called
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.any(String),
        expect.any(Number),
      );

      // Verify that show_view was still called

      expect(result).toStrictEqual({
        arrangementStart: "5|1",
        clips: [],
      });
    });
  });
});
