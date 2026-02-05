// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import {
  prepareSplitParams,
  performSplitting,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import {
  setupLoopedClipSplittingMocks,
  setupSplittingClipBaseMocks,
  setupSplittingClipGetMock,
  setupUnloopedClipSplittingMocks,
} from "./arrangement-splitting-test-helpers.ts";

describe("prepareSplitParams", () => {
  beforeEach(() => {
    liveApiGet.mockReset();
  });

  it("should return null when split is undefined", () => {
    const warnings = new Set<string>();
    const result = prepareSplitParams(undefined, [], warnings);

    expect(result).toBeNull();
  });

  it("should warn and return null when no arrangement clips", () => {
    const warnings = new Set<string>();
    const result = prepareSplitParams("2|1, 3|1", [], warnings);

    expect(result).toBeNull();
    expect(warnings.has("split-no-arrangement")).toBe(true);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("split requires arrangement clips"),
    );
  });

  it("should warn and return null for invalid format", () => {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, { looping: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const warnings = new Set<string>();

    const result = prepareSplitParams("invalid", [mockClip], warnings);

    expect(result).toBeNull();
    expect(warnings.has("split-invalid-format")).toBe(true);
  });

  it("should parse valid bar|beat positions", () => {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, { looping: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const warnings = new Set<string>();

    // 2|1 = 4 beats, 3|1 = 8 beats (in 4/4)
    const result = prepareSplitParams("2|1, 3|1", [mockClip], warnings);

    expect(result).toStrictEqual([4, 8]);
    expect(warnings.size).toBe(0);
  });

  it("should sort and deduplicate split points", () => {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, { looping: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const warnings = new Set<string>();

    // Out of order with duplicate
    const result = prepareSplitParams("3|1, 2|1, 2|1", [mockClip], warnings);

    expect(result).toStrictEqual([4, 8]); // Sorted and deduplicated
  });

  it("should filter out split points at clip start (1|1)", () => {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, { looping: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const warnings = new Set<string>();

    const result = prepareSplitParams("1|1, 2|1", [mockClip], warnings);

    // 1|1 = 0 beats (filtered out), 2|1 = 4 beats
    expect(result).toStrictEqual([4]);
  });

  it("should warn when all split points are at or before clip start", () => {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, { looping: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const warnings = new Set<string>();

    const result = prepareSplitParams("1|1", [mockClip], warnings);

    expect(result).toBeNull();
    expect(warnings.has("split-no-valid-points")).toBe(true);
  });

  it("should warn when too many split points", () => {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, { looping: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const warnings = new Set<string>();

    // Create 33 split points (exceeds MAX_SPLIT_POINTS = 32)
    const manyPoints = Array.from({ length: 33 }, (_, i) => `${i + 2}|1`).join(
      ", ",
    );
    const result = prepareSplitParams(manyPoints, [mockClip], warnings);

    expect(result).toBeNull();
    expect(warnings.has("split-max-exceeded")).toBe(true);
  });
});

describe("performSplitting", () => {
  beforeEach(() => {
    liveApiCall.mockReset();
    liveApiGet.mockReset();
  });

  it("should split looped clips at specified positions", () => {
    const clipId = "clip_1";

    setupLoopedClipSplittingMocks(clipId);

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    // Split a 16-beat clip at 4 and 8 beats (2|1 and 3|1 in 4/4)
    performSplitting([mockClip], [4, 8], clips, warnings, {
      holdingAreaStartBeats: 40000,
    });

    // Should create segments via duplication
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should skip clips where all split points are beyond clip length", () => {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, {
      looping: true,
      endTime: 4.0, // 4-beat clip
      loopEnd: 4.0,
    });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    // Split points at 8 and 12 beats are beyond 4-beat clip
    performSplitting([mockClip], [8, 12], clips, warnings, {
      holdingAreaStartBeats: 40000,
    });

    // Should not create any duplicates
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should split unlooped MIDI clips by duplicating and setting markers", () => {
    const clipId = "clip_1";

    setupUnloopedClipSplittingMocks(clipId, { isMidi: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    // Split an 8-beat unlooped clip at 4 beats
    performSplitting([mockClip], [4], clips, warnings, {
      holdingAreaStartBeats: 40000,
    });

    // Should duplicate for the second segment
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should skip clips with no trackIndex and emit warning", () => {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, { looping: true });

    const mockClip = LiveAPI.from(`id ${clipId}`);

    // Override trackIndex to be null
    Object.defineProperty(mockClip, "trackIndex", { get: () => null });

    const clips = [mockClip];
    const warnings = new Set<string>();

    performSplitting([mockClip], [4], clips, warnings, {
      holdingAreaStartBeats: 40000,
    });

    // Should emit warning about trackIndex
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("trackIndex"),
    );
  });

  it("should filter split points to those within clip bounds", () => {
    const clipId = "clip_1";
    let duplicateCount = 0;

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, {
      looping: true,
      endTime: 8.0, // 8-beat clip
      loopEnd: 4.0,
    });

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        duplicateCount++;

        return ["id", `dup_${duplicateCount}`];
      }

      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
    });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    // Split points: 4 (valid), 12 (beyond clip end)
    performSplitting([mockClip], [4, 12], clips, warnings, {
      holdingAreaStartBeats: 40000,
    });

    // With the source-copy algorithm for looped clips:
    // - Source copy at holding area: 1 duplicate
    // - First segment (0-4): 2 duplicates (work copy + move)
    // - Second segment (4-8): 2 duplicates (work copy + move)
    // Total: 5 duplicates for 2 segments
    // The point at 12 should be filtered out (would add 2 more if not)
    expect(duplicateCount).toBe(5);
  });

  it("should split unlooped audio clips by revealing content", () => {
    const clipId = "clip_1";

    setupUnloopedClipSplittingMocks(clipId, { isMidi: false });

    // Audio splitting needs scene ID
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

    // Split an 8-beat unlooped audio clip at 4 beats
    performSplitting([mockClip], [4], clips, warnings, {
      holdingAreaStartBeats: 40000,
    });

    // Should duplicate for audio content reveal
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should warn when MIDI duplication fails", () => {
    const clipId = "clip_1";
    let callCount = 0;

    setupSplittingClipBaseMocks(clipId, {
      generatedPrefixes: ["holding_", "moved_", "split_"],
    });
    setupSplittingClipGetMock(
      clipId,
      {
        looping: false,
        endTime: 8.0,
        loopEnd: 8.0,
        endMarker: 8.0,
      },
      ["holding_", "moved_", "split_"],
    );

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;

        // Return "0" which makes exists() return false
        return ["id", "0"];
      }

      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
    });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];
    const warnings = new Set<string>();

    performSplitting([mockClip], [4], clips, warnings, {
      holdingAreaStartBeats: 40000,
    });

    // Should have attempted duplication
    expect(callCount).toBeGreaterThan(0);
    // Should emit warning about failed duplication
    expect(warnings.has("split-duplicate-failed")).toBe(true);
  });
});
