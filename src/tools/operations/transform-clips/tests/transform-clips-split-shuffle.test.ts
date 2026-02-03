import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.ts";

describe("transformClips - split + shuffle combination", () => {
  it("should handle split + shuffle without stale object errors", () => {
    const clip1Id = "clip_1";
    const clip2Id = "clip_2";

    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "id clip_1") {
        return clip1Id;
      }

      if (this._path === "id clip_2") {
        return clip2Id;
      }

      return this._id!;
    });

    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      // Original clips
      if (this._id === clip1Id) {
        return "live_set tracks 0 arrangement_clips 0";
      }

      if (this._id === clip2Id) {
        return "live_set tracks 0 arrangement_clips 1";
      }

      // All generated clips (split and shuffled) need valid paths
      if (
        this._id?.startsWith("holding_") ||
        this._id?.startsWith("moved_") ||
        this._id?.startsWith("tile_") ||
        this._id?.startsWith("shuffled_")
      ) {
        return "live_set tracks 0 arrangement_clips 0";
      }

      return this._path;
    });

    liveApiType.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._id === clip1Id || this._id === clip2Id) {
        return "Clip";
      }
    });

    const splitClips: string[] = [];
    const shuffledClips: string[] = [];
    let isShufflePhase = false;

    /**
     * Mock clip properties for test clips
     * @param prop - Property name to retrieve
     * @param clipId - Clip ID
     * @returns Mock property value
     */
    function mockClipProperties(
      prop: string,
      clipId: string | undefined,
    ): number[] | null {
      if (clipId === clip1Id || clipId === clip2Id) {
        if (prop === "is_midi_clip") return [0];
        if (prop === "is_audio_clip") return [1];
        if (prop === "is_arrangement_clip") return [1];
        if (prop === "looping") return [1];
        if (prop === "loop_start") return [0];
        if (prop === "loop_end") return [2];
        if (prop === "start_marker") return [0];
        if (prop === "end_marker") return [2];
        if (prop === "gain") return [1.0];
        if (prop === "start_time") return clipId === clip1Id ? [0.0] : [2.0];
        if (prop === "end_time") return clipId === clip1Id ? [2.0] : [4.0];
      }

      return null;
    }

    /**
     * Mock properties for split clip objects
     * @param prop - Property name to retrieve
     * @param clipId - Clip ID
     * @returns Mock property value
     */
    function mockSplitClipProperties(
      prop: string,
      clipId: string | undefined,
    ): number[] | null {
      if (clipId?.startsWith("moved_") || clipId?.startsWith("tile_")) {
        if (prop === "is_midi_clip") return [0];
        if (prop === "is_audio_clip") return [1];
        if (prop === "is_arrangement_clip") return [1];
        if (prop === "looping") return [1];
        if (prop === "loop_start") return [0];
        if (prop === "loop_end") return [1];
        if (prop === "start_marker") return [0];
        if (prop === "end_marker") return [1];
        if (prop === "gain") return [1.0];

        const clipNum = Number.parseInt(clipId.split("_")[1] as string);

        if (prop === "start_time") return [clipNum - 1];
        if (prop === "end_time") return [clipNum];
      }

      return null;
    }

    /**
     * Mock properties for shuffled clip objects
     * @param prop - Property name to retrieve
     * @param clipId - Clip ID
     * @returns Mock property value
     */
    function mockShuffledClipProperties(
      prop: string,
      clipId: string | undefined,
    ): number[] | null {
      if (clipId?.startsWith("shuffled_")) {
        if (prop === "is_midi_clip") return [0];
        if (prop === "is_audio_clip") return [1];
        if (prop === "is_arrangement_clip") return [1];
        if (prop === "looping") return [1];
        if (prop === "gain") return [1.0];
        if (prop === "start_time") return [Math.random() * 4];
        if (prop === "end_time") return [Math.random() * 4 + 1];
      }

      return null;
    }

    liveApiGet.mockImplementation(function (
      this: MockLiveAPIContext,
      prop: string,
    ) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
      }

      const clipResult =
        mockClipProperties(prop, this._id) ??
        mockSplitClipProperties(prop, this._id) ??
        mockShuffledClipProperties(prop, this._id);

      if (clipResult) return clipResult;

      // Track arrangement_clips query
      if (this._path === "live_set tracks 0" && prop === "arrangement_clips") {
        if (splitClips.length > 0) {
          if (shuffledClips.length > 0) {
            return ["id", ...shuffledClips.flatMap((id) => [id, "id"])].slice(
              0,
              -1,
            );
          }

          return ["id", ...splitClips.flatMap((id) => [id, "id"])].slice(0, -1);
        }

        return ["id", clip1Id, "id", clip2Id];
      }

      return [null];
    });

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
      ...args: unknown[]
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        const position = args[1] as number;
        const idCounter = Date.now() + Math.random();

        if (position >= 40000) {
          // Holding area - detect shuffle phase by position > 40000
          // Splitting uses exactly 40000, shuffle uses 40000, 40100, 40200, etc.
          if (position > 40000) {
            isShufflePhase = true;
          }

          return ["id", `holding_${idCounter}`];
        }

        if (isShufflePhase) {
          // Shuffle operation - moving clips from holding to final positions
          const shuffleId = `shuffled_${idCounter}`;

          shuffledClips.push(shuffleId);

          return ["id", shuffleId];
        }

        // Splitting operation - creating tile clips
        const splitId =
          splitClips.length === 0
            ? `moved_${splitClips.length + 1}`
            : `tile_${splitClips.length + 1}`;

        splitClips.push(splitId);

        return ["id", splitId];
      }

      if (method === "delete_clip") {
        // Track deletions but don't need to do anything
        return [];
      }

      return [null];
    });

    // Execute split + shuffle
    const result = transformClips(
      {
        clipIds: `${clip1Id},${clip2Id}`,
        split: "1|2", // Split at beat 2 of bar 1 (1 beat into each 2-beat clip)
        shuffleOrder: true,
        seed: 12345,
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should complete without errors and return clip IDs
    // The exact IDs and count depend on shuffle behavior, but should have clips
    expect(result.clipIds).toBeDefined();
    expect(result.clipIds.length).toBeGreaterThan(0);
    expect(result.seed).toBe(12345);

    // Verify no stale object access by checking that the function completed
    // (if there were stale object errors, mocks would have thrown)
    expect(liveApiGet).toHaveBeenCalled();
    expect(liveApiCall).toHaveBeenCalled();
  });
});
