// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import type { Mock } from "vitest";
import { liveApiGet } from "#src/test/mocks/mock-live-api.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  prepareSplitParams,
  performSplitting,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import {
  setupClipSplittingMocks,
  setupSplittingClipBaseMocks,
  setupSplittingClipGetMock,
} from "./arrangement-splitting-test-helpers.ts";

const HOLDING_AREA = { holdingAreaStartBeats: 40000 } as const;

function createPerformContext(clipId: string): {
  mockClip: LiveAPI;
  clips: LiveAPI[];
} {
  const mockClip = LiveAPI.from(`id ${clipId}`);
  const clips = [mockClip];

  return { mockClip, clips };
}

function expectDuplicateCalled(trackMock: RegisteredMockObject): void {
  expect(trackMock.call).toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    expect.any(String),
    expect.any(Number),
  );
}

function expectDuplicateNotCalled(trackMock: RegisteredMockObject): void {
  expect(trackMock.call).not.toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    expect.any(String),
    expect.any(Number),
  );
}

describe("prepareSplitParams", () => {
  function setupPrepareTest(): {
    mockClip: LiveAPI;
    warnings: Set<string>;
  } {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, { looping: true });
    const mockClip = LiveAPI.from(`id ${clipId}`);
    const warnings = new Set<string>();

    return { mockClip, warnings };
  }

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
    const { mockClip, warnings } = setupPrepareTest();

    const result = prepareSplitParams("invalid", [mockClip], warnings);

    expect(result).toBeNull();
    expect(warnings.has("split-invalid-format")).toBe(true);
  });

  it("should parse valid bar|beat positions", () => {
    const { mockClip, warnings } = setupPrepareTest();

    // 2|1 = 4 beats, 3|1 = 8 beats (in 4/4)
    const result = prepareSplitParams("2|1, 3|1", [mockClip], warnings);

    expect(result).toStrictEqual([4, 8]);
    expect(warnings.size).toBe(0);
  });

  it("should sort and deduplicate split points", () => {
    const { mockClip, warnings } = setupPrepareTest();

    // Out of order with duplicate
    const result = prepareSplitParams("3|1, 2|1, 2|1", [mockClip], warnings);

    expect(result).toStrictEqual([4, 8]); // Sorted and deduplicated
  });

  it("should filter out split points at clip start (1|1)", () => {
    const { mockClip, warnings } = setupPrepareTest();

    const result = prepareSplitParams("1|1, 2|1", [mockClip], warnings);

    // 1|1 = 0 beats (filtered out), 2|1 = 4 beats
    expect(result).toStrictEqual([4]);
  });

  it("should warn when all split points are at or before clip start", () => {
    const { mockClip, warnings } = setupPrepareTest();

    const result = prepareSplitParams("1|1", [mockClip], warnings);

    expect(result).toBeNull();
    expect(warnings.has("split-no-valid-points")).toBe(true);
  });

  it("should warn when too many split points", () => {
    const { mockClip, warnings } = setupPrepareTest();

    // Create 33 split points (exceeds MAX_SPLIT_POINTS = 32)
    const manyPoints = Array.from({ length: 33 }, (_, i) => `${i + 2}|1`).join(
      ", ",
    );
    const result = prepareSplitParams(manyPoints, [mockClip], warnings);

    expect(result).toBeNull();
    expect(warnings.has("split-max-exceeded")).toBe(true);
  });

  it("should handle trailing commas in split string", () => {
    const { mockClip, warnings } = setupPrepareTest();

    // Trailing comma produces an empty part that gets skipped
    const result = prepareSplitParams("2|1, 3|1, ", [mockClip], warnings);

    expect(result).toStrictEqual([4, 8]);
    expect(warnings.size).toBe(0);
  });

  it("should not duplicate the same warning within a single call", () => {
    const warnings = new Set<string>();

    // First call: warns about no arrangement clips
    prepareSplitParams("2|1", [], warnings);
    expect(warnings.has("split-no-arrangement")).toBe(true);

    // Second call with the same warnings set: should not warn again
    const outletCallCount = (outlet as Mock).mock.calls.length;

    prepareSplitParams("2|1", [], warnings);

    // No additional outlet calls for the same warning
    expect((outlet as Mock).mock.calls).toHaveLength(outletCallCount);
  });
});

describe("performSplitting", () => {
  beforeEach(() => {
    liveApiGet.mockReset();
  });

  it("should split looped clips at specified positions", () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);
    const { mockClip, clips } = createPerformContext(clipId);

    // Split a 16-beat clip at 4 and 8 beats (2|1 and 3|1 in 4/4)
    performSplitting([mockClip], [4, 8], clips, HOLDING_AREA);

    // Should create segments via duplication
    expectDuplicateCalled(callState.trackMock);
  });

  it("should skip clips where all split points are beyond clip length", () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId, {
      looping: true,
      endTime: 4.0, // 4-beat clip
      loopEnd: 4.0,
    });
    const { mockClip, clips } = createPerformContext(clipId);

    // Split points at 8 and 12 beats are beyond 4-beat clip
    performSplitting([mockClip], [8, 12], clips, HOLDING_AREA);

    // Should not create any duplicates
    expectDuplicateNotCalled(callState.trackMock);
  });

  it("should warn and abort when duplication fails", () => {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, { looping: true });

    const { callState } = setupClipSplittingMocks(clipId);
    const { mockClip, clips } = createPerformContext(clipId);

    // Make duplicate_clip_to_arrangement return "0" (non-existent)
    callState.trackMock.call.mockImplementation((method: string) => {
      if (method === "duplicate_clip_to_arrangement") {
        return ["id", "0"];
      }
    });

    performSplitting([mockClip], [4], clips, HOLDING_AREA);

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Failed to duplicate"),
    );
  });

  it("should split unlooped MIDI clips using unified algorithm", () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId, {
      looping: false,
      endTime: 8.0,
      loopEnd: 8.0,
      endMarker: 8.0,
    });
    const { mockClip, clips } = createPerformContext(clipId);

    // Split an 8-beat unlooped clip at 4 beats
    performSplitting([mockClip], [4], clips, HOLDING_AREA);

    // Should duplicate for segments
    expectDuplicateCalled(callState.trackMock);
  });

  it("should skip clips with no trackIndex and emit warning", () => {
    const clipId = "clip_1";

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, { looping: true });
    const { mockClip, clips } = createPerformContext(clipId);

    // Override trackIndex to be null
    Object.defineProperty(mockClip, "trackIndex", { get: () => null });

    performSplitting([mockClip], [4], clips, HOLDING_AREA);

    // Should emit warning about trackIndex
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("trackIndex"),
    );
  });

  it("should filter split points to those within clip bounds", () => {
    const clipId = "clip_1";
    let duplicateCount = 0;

    const { callState } = setupClipSplittingMocks(clipId, {
      looping: true,
      endTime: 8.0, // 8-beat clip
      loopEnd: 4.0,
    });

    // Override to track duplicate count
    callState.trackMock.call.mockImplementation((method: string) => {
      if (method === "duplicate_clip_to_arrangement") {
        duplicateCount++;

        return ["id", `dup_${duplicateCount}`];
      }

      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
    });

    const { mockClip, clips } = createPerformContext(clipId);

    // Split points: 4 (valid), 12 (beyond clip end)
    performSplitting([mockClip], [4, 12], clips, HOLDING_AREA);

    // Optimized algorithm for 2 segments:
    // Step 1: 1 duplicate source to holding
    // Step 4: 1 moveClipFromHolding for last segment (= 1 duplicate)
    // Total: 2 duplicates (segment 0 stays in place via right-trim)
    // The point at 12 should be filtered out (would add 1 more if not)
    expect(duplicateCount).toBe(2);
  });

  it("should split unlooped audio clips using unified algorithm", () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId, {
      isMidi: false,
      looping: false,
      endTime: 8.0,
      loopEnd: 8.0,
      endMarker: 8.0,
    });
    const { mockClip, clips } = createPerformContext(clipId);

    // Audio splitting needs scene/slot mocking for createAndDeleteTempClip
    const originalGet = liveApiGet.getMockImplementation();

    liveApiGet.mockImplementation(function (
      this: { _path?: string; _id?: string },
      prop: string,
    ) {
      if (this._path === "live_set" && prop === "scenes") {
        return ["id", "scene_1"];
      }

      if (this._id === "scene_1" && prop === "is_empty") {
        return [1]; // Scene is empty, no need to create new one
      }

      return originalGet?.call(this, prop) ?? [0];
    });

    // Split an 8-beat unlooped audio clip at 4 beats
    performSplitting([mockClip], [4], clips, {
      holdingAreaStartBeats: 40000,
      silenceWavPath: "/tmp/silence.wav",
    });

    // Should duplicate for audio content
    expectDuplicateCalled(callState.trackMock);
  });

  it("should split into 3 segments exercising middle segment extraction", () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId, {
      looping: true,
      endTime: 12.0, // 12-beat clip
      loopEnd: 4.0,
    });
    const { mockClip, clips } = createPerformContext(clipId);

    // Split a 12-beat clip at 4 and 8 beats → 3 segments
    performSplitting([mockClip], [4, 8], clips, HOLDING_AREA);

    // Optimized algorithm for 3 segments:
    // Step 1: 1 duplicate source to holding
    // Step 3: 1 dup middle segment + 1 moveClipFromHolding (middle)
    // Step 4: 1 moveClipFromHolding (last segment)
    // Total: 4 duplicates
    expect(callState.duplicateCount).toBe(4);
  });

  it("should warn and skip when middle segment duplication fails", () => {
    const clipId = "clip_1";
    let duplicateCount = 0;

    setupSplittingClipBaseMocks(clipId);
    setupSplittingClipGetMock(clipId, {
      looping: true,
      endTime: 12.0, // 12-beat clip
      loopEnd: 4.0,
    });

    const { callState } = setupClipSplittingMocks(clipId, {
      looping: true,
      endTime: 12.0,
      loopEnd: 4.0,
    });

    // Override the call mock to fail on second duplicate
    callState.trackMock.call.mockImplementation((method: string) => {
      if (method === "duplicate_clip_to_arrangement") {
        duplicateCount++;

        // First dup succeeds (source to holding), second fails (middle segment)
        if (duplicateCount === 2) return ["id", "0"];

        return ["id", `dup_${duplicateCount}`];
      }

      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
    });

    const { mockClip, clips } = createPerformContext(clipId);

    // Split at 4 and 8 → 3 segments, but middle dup fails
    performSplitting([mockClip], [4, 8], clips, HOLDING_AREA);

    // Should warn about the failed middle segment
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Failed to duplicate source for middle segment"),
    );

    // Should still complete: source dup (1) + failed middle (1) + last move (1) = 3
    expect(duplicateCount).toBe(3);
  });

  it("should rescan split clips replacing stale references with fresh ones", () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    // Register fresh clips that will be returned by the track rescan
    registerMockObject("fresh_1", {
      path: "live_set tracks 0 arrangement_clips 0",
      type: "Clip",
      properties: {
        start_time: 0.0,
      },
    });
    registerMockObject("fresh_2", {
      path: "live_set tracks 0 arrangement_clips 1",
      type: "Clip",
      properties: {
        start_time: 4.0,
      },
    });

    // Override track's get mock to return fresh clips for arrangement_clips
    callState.trackMock.get.mockImplementation((prop: string) => {
      if (prop === "arrangement_clips") {
        return ["id", "fresh_1", "id", "fresh_2"];
      }

      return [0];
    });

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];

    performSplitting([mockClip], [4, 8], clips, {
      holdingAreaStartBeats: 40000,
    });

    // clips array should now contain fresh clip references from rescan
    expect(clips).toHaveLength(2);
    expect(clips.some((c) => c.id === "fresh_1")).toBe(true);
    expect(clips.some((c) => c.id === "fresh_2")).toBe(true);
    // The original clip should have been replaced
    expect(clips.some((c) => c.id === clipId)).toBe(false);
  });

  it("should handle rescan when stale clip ID is not found in clips array", () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    // Register fresh clip that will be returned by the track rescan
    registerMockObject("fresh_1", {
      path: "live_set tracks 0 arrangement_clips 0",
      type: "Clip",
      properties: {
        start_time: 0.0,
      },
    });

    // Override track's get mock to return fresh clip for arrangement_clips
    callState.trackMock.get.mockImplementation((prop: string) => {
      if (prop === "arrangement_clips") {
        return ["id", "fresh_1"];
      }

      return [0];
    });

    const mockClip = LiveAPI.from(`id ${clipId}`);

    // Pass an empty clips array so staleIndex will be -1
    const clips: LiveAPI[] = [];

    performSplitting([mockClip], [4], clips, {
      holdingAreaStartBeats: 40000,
    });

    // clips array should remain empty since stale clip was not found
    expect(clips).toHaveLength(0);
  });
});
