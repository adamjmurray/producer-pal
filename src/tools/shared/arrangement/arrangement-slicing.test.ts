import { beforeEach, describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import {
  prepareSliceParams,
  performSlicing,
} from "#src/tools/shared/arrangement/arrangement-slicing.ts";
import {
  setupLoopedClipSlicingMocks,
  setupSlicingClipBaseMocks,
  setupSlicingClipGetMock,
  setupTwoClipBaseMocks,
  setupUnloopedClipSlicingMocks,
} from "./arrangement-slicing-test-helpers.ts";

describe("prepareSliceParams", () => {
  beforeEach(() => {
    liveApiGet.mockReset();
  });

  it("should return null when slice is undefined", () => {
    const warnings = new Set<string>();
    const result = prepareSliceParams(undefined, [], warnings);

    expect(result).toBeNull();
  });

  it("should warn and return null when no arrangement clips", () => {
    const warnings = new Set<string>();
    const result = prepareSliceParams("1:0.0", [], warnings);

    expect(result).toBeNull();
    expect(warnings.has("slice-no-arrangement")).toBe(true);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("slice requires arrangement clips"),
    );
  });

  it("should warn and return null when slice is <= 0", () => {
    const clipId = "clip_1";

    setupSlicingClipBaseMocks(clipId);
    setupSlicingClipGetMock(clipId, { looping: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const warnings = new Set<string>();

    const result = prepareSliceParams("0:0.0", [mockClip], warnings);

    expect(result).toBeNull();
    expect(warnings.has("slice-invalid-size")).toBe(true);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("slice must be greater than 0"),
    );
  });

  it("should return slice beats for valid slice parameter", () => {
    const clipId = "clip_1";

    setupSlicingClipBaseMocks(clipId);
    setupSlicingClipGetMock(clipId, { looping: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const warnings = new Set<string>();

    // 1:0.0 = 1 bar = 4 beats in 4/4
    const result = prepareSliceParams("1:0.0", [mockClip], warnings);

    expect(result).toBe(4);
    expect(warnings.size).toBe(0);
  });

  it("should deduplicate warnings for repeated no-arrangement calls", () => {
    const warnings = new Set<string>();

    // First call should warn
    prepareSliceParams("1:0.0", [], warnings);
    expect(warnings.has("slice-no-arrangement")).toBe(true);

    // Second call should not add another warning (same key)
    const initialSize = warnings.size;

    prepareSliceParams("1:0.0", [], warnings);
    expect(warnings.size).toBe(initialSize);
  });

  it("should deduplicate warnings for repeated invalid slice size calls", () => {
    const clipId = "clip_1";

    setupSlicingClipBaseMocks(clipId);
    setupSlicingClipGetMock(clipId, { looping: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const warnings = new Set<string>();

    // First call with invalid slice should warn
    prepareSliceParams("0:0.0", [mockClip], warnings);
    expect(warnings.has("slice-invalid-size")).toBe(true);

    // Second call should not add another warning
    const initialSize = warnings.size;

    prepareSliceParams("0:0.0", [mockClip], warnings);
    expect(warnings.size).toBe(initialSize);
  });
});

describe("performSlicing", () => {
  beforeEach(() => {
    liveApiCall.mockReset();
    liveApiGet.mockReset();
  });

  it("should slice looped clips and tile to original length", () => {
    const clipId = "clip_1";

    setupLoopedClipSlicingMocks(clipId);

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    performSlicing(
      [mockClip],
      4, // 4 beats = 1 bar
      clips,
      warnings,
      "1:0.0",
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

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    performSlicing(
      [mockClip],
      4, // 4 beats (larger than clip)
      clips,
      warnings,
      "1:0.0",
      { holdingAreaStartBeats: 40000 },
    );

    // Should not create temp clips or tiles
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("should warn and skip when MAX_SLICES limit would be exceeded", () => {
    const clip1Id = "clip_1";
    const clip2Id = "clip_2";
    let sliceOperationCount = 0;

    setupTwoClipBaseMocks(clip1Id, clip2Id);
    liveApiGet.mockImplementation(function (
      this: MockLiveAPIContext,
      prop: string,
    ) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
      }

      if (this._id === clip1Id || this._id === clip2Id) {
        if (prop === "is_midi_clip") return [1];
        if (prop === "is_audio_clip") return [0];
        if (prop === "is_arrangement_clip") return [1];
        if (prop === "looping") return [1];
        if (prop === "start_time") return [0];
        // 8 beats = 2 bars, which creates 64 slices at 0.125 beats (32nd notes)
        if (prop === "end_time") return [8];
        if (prop === "loop_start") return [0.0];
        if (prop === "loop_end") return [1.0];
        if (prop === "end_marker") return [1.0];
      }

      if (this._id?.startsWith("holding_")) {
        if (prop === "end_time") return [40000 + 0.125];
        if (prop === "loop_start" || prop === "start_marker") return [0.0];
      }

      const isMovedClip = this._id?.startsWith("moved_") === true;
      const isTileClip = this._id?.startsWith("tile_") === true;

      if (
        (isMovedClip || isTileClip) &&
        (prop === "loop_start" || prop === "start_marker")
      )
        return [0.0];

      if (this._path === "live_set tracks 0" && prop === "track_index")
        return [0];

      return [0];
    });
    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        sliceOperationCount++;

        return ["id", `dup_${sliceOperationCount}`];
      }

      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
    });

    const mockClip1 = LiveAPI.from(`id ${clip1Id}`);
    const mockClip2 = LiveAPI.from(`id ${clip2Id}`);
    const clips = [mockClip1, mockClip2];
    const warnings = new Set<string>();

    // First clip would create 64 slices (at the limit)
    // Second clip would also create 64 slices (exceeding limit)
    // Should warn and skip, not throw
    performSlicing(
      [mockClip1, mockClip2],
      0.125, // 32nd notes: creates 64 slices for 8-beat clip
      clips,
      warnings,
      "0:0.125",
      { holdingAreaStartBeats: 40000 },
    );

    expect(warnings.has("slice-max-exceeded")).toBe(true);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("exceeding max"),
    );
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
        if (prop === "loop_start" || prop === "start_marker") return [0.0];
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
        if (prop === "loop_start" || prop === "start_marker") return [0.0];

        if (prop === "start_time") {
          if (id === "moved_1") return [0.0];
          if (id === "tile_2") return [1.0];
          if (id === "tile_3") return [2.0];
        }
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

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;

        if (callCount === 1) return ["id", "holding_1"];

        if (callCount === 2) return ["id", "moved_1"];

        if (callCount === 3) return ["id", "tile_2"];

        if (callCount === 4) return ["id", "tile_3"];
      }

      if (method === "create_audio_clip") {
        return ["id", "temp_1"];
      }
    });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    performSlicing(
      [mockClip],
      1, // 1 beat slices (creates 3 slices from 3-beat clip)
      clips,
      warnings,
      "0:1.0",
      { holdingAreaStartBeats: 40000 },
    );

    // Should update clips array to contain exactly 3 clips (the new sliced clips)
    // Should NOT include the following clip
    expect(clips).toHaveLength(3);
    expect(clips.map((c) => c.id)).toStrictEqual([
      "moved_1",
      "tile_2",
      "tile_3",
    ]);
  });

  it("should slice unlooped MIDI clips by duplicating and setting markers", () => {
    const clipId = "clip_1";

    setupUnloopedClipSlicingMocks(clipId, { isMidi: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    performSlicing(
      [mockClip],
      2, // 2 beats per slice (8 beat clip = 4 slices)
      clips,
      warnings,
      "0:2.0",
      { holdingAreaStartBeats: 40000 },
    );

    // Should call duplicate_clip_to_arrangement for each slice
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should skip clips with no trackIndex and emit warning", () => {
    const clipId = "clip_1";

    setupSlicingClipBaseMocks(clipId);
    // Set up a clip with no trackIndex
    liveApiGet.mockImplementation(function (
      this: MockLiveAPIContext,
      prop: string,
    ) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
      }

      if (this._id === clipId) {
        if (prop === "is_midi_clip") return [1];
        if (prop === "is_arrangement_clip") return [1];
        if (prop === "looping") return [1];
        if (prop === "start_time") return [0.0];
        if (prop === "end_time") return [8.0];
        if (prop === "loop_end") return [4.0];
      }

      return [0];
    });

    // Mock trackIndex to be null (via path that doesn't match expected pattern)
    const mockClip = LiveAPI.from(`id ${clipId}`);

    // Override the path to simulate a clip without a valid track path
    Object.defineProperty(mockClip, "trackIndex", { get: () => null });

    const clips = [mockClip];
    const warnings = new Set<string>();

    performSlicing([mockClip], 4, clips, warnings, "1:0.0", {
      holdingAreaStartBeats: 40000,
    });

    // Should emit warning about trackIndex
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("trackIndex"),
    );
  });

  it("should handle clips exactly matching slice size (no remaining length)", () => {
    const clipId = "clip_1";

    setupSlicingClipBaseMocks(clipId);
    setupSlicingClipGetMock(clipId, {
      looping: true,
      endTime: 4.0, // Exactly 4 beats
      loopEnd: 4.0,
    });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    performSlicing(
      [mockClip],
      4, // 4 beats = clip length exactly
      clips,
      warnings,
      "1:0.0",
      { holdingAreaStartBeats: 40000 },
    );

    // Should still perform the holding area operation
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should slice unlooped audio clips by revealing content", () => {
    const clipId = "clip_1";

    setupUnloopedClipSlicingMocks(clipId, { isMidi: false });

    // Audio slicing needs scene ID for createAudioClipInSession
    const originalGet = liveApiGet.getMockImplementation();

    liveApiGet.mockImplementation(function (
      this: MockLiveAPIContext,
      prop: string,
    ) {
      if (this._path === "live_set" && prop === "scenes") {
        return ["id", "scene_1"];
      }

      return originalGet?.call(this, prop) ?? [0];
    });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    performSlicing(
      [mockClip],
      2, // 2 beats per slice
      clips,
      warnings,
      "0:2.0",
      { holdingAreaStartBeats: 40000 },
    );

    // Should call duplicate_clip_to_arrangement for audio content reveal
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should warn when MIDI slice duplication fails", () => {
    const clipId = "clip_1";
    let callCount = 0;

    setupSlicingClipBaseMocks(clipId, {
      generatedPrefixes: ["holding_", "moved_", "slice_"],
    });
    setupSlicingClipGetMock(
      clipId,
      {
        looping: false,
        endTime: 8.0,
        loopEnd: 8.0,
        endMarker: 8.0,
      },
      ["holding_", "moved_", "slice_"],
    );

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;

        // First calls succeed (for holding, moving)
        if (callCount === 1) return ["id", "holding_1"];

        if (callCount === 2) return ["id", "moved_1"];

        // Subsequent calls (for slices) return "0" which makes exists() return false
        return ["id", "0"];
      }

      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
    });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    performSlicing([mockClip], 2, clips, warnings, "0:2.0", {
      holdingAreaStartBeats: 40000,
    });

    // Should have called duplicate multiple times
    expect(callCount).toBeGreaterThan(2);
    // Should emit warning about failed duplication
    expect(warnings.has("slice-duplicate-failed")).toBe(true);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Failed to duplicate clip for MIDI slice"),
    );
  });
});
