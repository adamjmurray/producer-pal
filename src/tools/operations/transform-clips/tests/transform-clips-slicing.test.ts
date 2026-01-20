import { describe, expect, it, vi } from "vitest";
import { liveApiCall, liveApiGet } from "#src/test/mocks/mock-live-api.ts";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.ts";
import {
  setupLoopedClipSlicingMocks,
  setupSlicingClipBaseMocks,
  setupSlicingClipGetMock,
  setupTwoClipBaseMocks,
} from "./transform-clips-slicing-test-helpers.ts";

interface MockContext {
  _id?: string;
  _path?: string;
}

describe("transformClips - slicing", () => {
  it("should slice looped clips and tile to original length", () => {
    const clipId = "clip_1";

    setupLoopedClipSlicingMocks(clipId);

    transformClips(
      {
        clipIds: clipId,
        slice: "1:0.0", // 1 bar = 4 beats slice
        seed: 12345,
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should create temp clip to shorten
    expect(liveApiCall).toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );

    // Should call tileClipToRange via arrangement-tiling helpers
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should skip clips smaller than slice size", () => {
    const clipId = "clip_1";

    setupSlicingClipBaseMocks(clipId);
    setupSlicingClipGetMock(clipId, {
      looping: true,
      endTime: 2.0,
      loopEnd: 2.0,
    });

    const result = transformClips({
      clipIds: clipId,
      slice: "1:0.0", // 1 bar = 4 beats (larger than clip)
      seed: 12345,
    });

    // Clip should not be modified
    expect(result.clipIds).toStrictEqual([clipId]);

    // Should not create temp clips or tiles
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("should warn when slice is used with non-arrangement clips", () => {
    const clipId = "clip_1";

    setupSlicingClipBaseMocks(clipId, {
      path: "live_set tracks 0 clip_slots 0 clip",
    });
    // Override to be a session clip
    liveApiGet.mockImplementation(function (this: MockContext, prop: string) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
      }

      if (this._id === clipId) {
        if (prop === "is_midi_clip") return [1];
        if (prop === "is_audio_clip") return [0];
        if (prop === "is_arrangement_clip") return [0]; // Session clip
      }

      return [0];
    });

    const consoleErrorSpy = vi.spyOn(console, "error");

    transformClips({
      clipIds: clipId,
      slice: "1:0.0",
      seed: 12345,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("slice requires arrangement clips"),
    );
  });

  it("should throw error when slice is <= 0", () => {
    const clipId = "clip_1";

    setupSlicingClipBaseMocks(clipId);
    setupSlicingClipGetMock(clipId, { looping: true });

    expect(() =>
      transformClips({
        clipIds: clipId,
        slice: "0:0.0",
        seed: 12345,
      }),
    ).toThrow("slice must be greater than 0");
  });

  it("should stop slicing when MAX_SLICES limit is reached", () => {
    const clip1Id = "clip_1";
    const clip2Id = "clip_2";
    let sliceOperationCount = 0;

    setupTwoClipBaseMocks(clip1Id, clip2Id);
    liveApiGet.mockImplementation(function (this: MockContext, prop: string) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }

        if (prop === "signature_denominator") {
          return [4];
        }
      }

      if (this._id === clip1Id || this._id === clip2Id) {
        if (prop === "is_midi_clip") {
          return [1];
        }

        if (prop === "is_audio_clip") {
          return [0];
        }

        if (prop === "is_arrangement_clip") {
          return [1];
        }

        if (prop === "looping") {
          return [1];
        }

        if (prop === "start_time") {
          return [0];
        }

        if (prop === "end_time") {
          // 8 beats = 2 bars, which creates 64 slices at 0.125 beats (32nd notes)
          return [8];
        }

        if (prop === "loop_start") {
          return [0.0];
        }

        if (prop === "loop_end") {
          return [1.0];
        }

        if (prop === "end_marker") {
          return [1.0];
        }
      }

      if (this._id?.startsWith("holding_")) {
        if (prop === "end_time") {
          return [40000 + 0.125];
        }

        if (prop === "loop_start") {
          return [0.0];
        }

        if (prop === "start_marker") {
          return [0.0];
        }
      }

      if (this._id?.startsWith("moved_") || this._id?.startsWith("tile_")) {
        if (prop === "loop_start") {
          return [0.0];
        }

        if (prop === "start_marker") {
          return [0.0];
        }
      }

      if (this._path === "live_set tracks 0" && prop === "track_index") {
        return [0];
      }

      return [0];
    });
    liveApiCall.mockImplementation(function (
      this: MockContext,
      method: string,
    ) {
      // Track when we duplicate/move clips (which happens during slicing)
      if (method === "duplicate_clip_to_arrangement") {
        sliceOperationCount++;

        return ["id", `dup_${sliceOperationCount}`];
      }

      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
    });

    // First clip would create 64 slices (at the limit)
    // Second clip would also create 64 slices (exceeding limit)
    // Should throw an error when processing second clip
    expect(() =>
      transformClips(
        {
          clipIds: `${clip1Id},${clip2Id}`,
          slice: "0:0.125", // 32nd notes: creates exactly 64 slices for 2-bar clip
          seed: 12345,
        },
        { holdingAreaStartBeats: 40000 },
      ),
    ).toThrow(/would create 64 slices.*Maximum 64 slices total/);
  });

  it("should only return newly created clips from slicing, not following clips", () => {
    const clipId = "clip_1";
    const followingClipId = "clip_following";
    let callCount = 0;

    setupTwoClipBaseMocks(clipId, followingClipId);

    /**
     * Mock properties for primary clip objects
     * @param prop - Property name to retrieve
     * @param id - Clip ID
     * @returns Mock property value
     */
    function mockPrimaryClipProperties(
      prop: string,
      id: string | undefined,
    ): number[] | null {
      if (id === clipId) {
        if (prop === "is_midi_clip") return [0];
        if (prop === "is_audio_clip") return [1];
        if (prop === "is_arrangement_clip") return [1];
        if (prop === "looping") return [1];
        if (prop === "start_time") return [0.0];
        if (prop === "end_time") return [3.0];
        if (prop === "loop_start") return [0.0];
        if (prop === "loop_end") return [8.0];
        if (prop === "end_marker") return [8.0];
      }

      return null;
    }

    /**
     * Mock properties for following clip objects
     * @param prop - Property name to retrieve
     * @param id - Clip ID
     * @returns Mock property value
     */
    function mockFollowingClipProperties(
      prop: string,
      id: string | undefined,
    ): number[] | null {
      if (id === followingClipId) {
        if (prop === "is_midi_clip") return [0];
        if (prop === "is_audio_clip") return [1];
        if (prop === "is_arrangement_clip") return [1];
        if (prop === "start_time") return [3.0];
        if (prop === "end_time") return [7.0];
      }

      return null;
    }

    /**
     * Mock properties for holding clip objects
     * @param prop - Property name to retrieve
     * @param id - Clip ID
     * @returns Mock property value
     */
    function mockHoldingClipProperties(
      prop: string,
      id: string | undefined,
    ): number[] | null {
      if (id?.startsWith("holding_")) {
        if (prop === "end_time") return [40000 + 3];
        if (prop === "loop_start") return [0.0];
        if (prop === "start_marker") return [0.0];
      }

      return null;
    }

    /**
     * Mock properties for sliced clip objects
     * @param prop - Property name to retrieve
     * @param id - Clip ID
     * @returns Mock property value
     */
    function mockSlicedClipProperties(
      prop: string,
      id: string | undefined,
    ): number[] | null {
      if (id?.startsWith("moved_") || id?.startsWith("tile_")) {
        if (prop === "loop_start") return [0.0];
        if (prop === "start_marker") return [0.0];

        if (prop === "start_time") {
          if (id === "moved_1") return [0.0];
          if (id === "tile_2") return [1.0];
          if (id === "tile_3") return [2.0];
        }
      }

      return null;
    }

    liveApiGet.mockImplementation(function (this: MockContext, prop: string) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "scenes") return ["id", "scene_1"];
      }

      const result =
        mockPrimaryClipProperties(prop, this._id) ??
        mockFollowingClipProperties(prop, this._id) ??
        mockHoldingClipProperties(prop, this._id) ??
        mockSlicedClipProperties(prop, this._id);

      if (result) return result;

      if (this._path === "live_set tracks 0") {
        if (prop === "track_index") return [0];

        if (prop === "arrangement_clips") {
          return [
            "id",
            "moved_1",
            "id",
            "tile_2",
            "id",
            "tile_3",
            "id",
            followingClipId,
          ];
        }
      }

      return [0];
    });

    // Mock liveApiCall for clip operations
    liveApiCall.mockImplementation(function (
      this: MockContext,
      method: string,
      ..._args: unknown[]
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;

        if (callCount === 1) {
          return ["id", "holding_1"];
        } else if (callCount === 2) {
          return ["id", "moved_1"];
        } else if (callCount === 3) {
          return ["id", "tile_2"];
        } else if (callCount === 4) {
          return ["id", "tile_3"];
        }
      }

      if (method === "create_audio_clip") {
        return ["id", "temp_1"];
      }
    });

    const result = transformClips(
      {
        clipIds: clipId,
        slice: "0:1.0", // 1 beat slices (creates 3 slices from 3-beat clip)
        seed: 12345,
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should return exactly 3 clips (the new sliced clips)
    // Should NOT include the following clip
    expect(result.clipIds).toHaveLength(3);
    expect(result.clipIds).toStrictEqual(["moved_1", "tile_2", "tile_3"]);
    expect(result.clipIds).not.toContain(followingClipId);
  });
});
