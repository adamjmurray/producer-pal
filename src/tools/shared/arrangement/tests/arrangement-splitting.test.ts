// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, type Mock, vi } from "vitest";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  prepareSplitParams,
  performSplitting,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import {
  mockArrangementClipsRescan,
  overrideWithDuplicateCounter,
  setupClipSplittingMocks,
  setupSplitTest,
  setupSplittingClipBaseMocks,
  setupSplittingClipGetMock,
} from "./arrangement-splitting-test-helpers.ts";

const HOLDING_AREA = { holdingAreaStartBeats: 40000 } as const;

/** An 8-beat arrangement clip looping a 4-beat region. */
const EIGHT_BEAT_LOOPED = {
  looping: true,
  endTime: 8.0,
  loopEnd: 4.0,
} as const;

/** A 12-beat arrangement clip looping a 4-beat region. */
const TWELVE_BEAT_LOOPED = {
  looping: true,
  endTime: 12.0,
  loopEnd: 4.0,
} as const;

/** An 8-beat unlooped arrangement clip. */
const EIGHT_BEAT_UNLOOPED = {
  looping: false,
  endTime: 8.0,
  loopEnd: 8.0,
  endMarker: 8.0,
} as const;

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

function expectCreateMidiClipCount(
  trackMock: RegisteredMockObject,
  count: number,
): void {
  const createMidiCalls = trackMock.call.mock.calls.filter(
    (c: unknown[]) => c[0] === "create_midi_clip",
  );

  expect(createMidiCalls).toHaveLength(count);
}

// Assert a split ran (segments were duplicated) and produced exactly `count`
// create_midi_clip trims — the signature of which EPSILON-boundary trim steps
// were skipped.
function expectSplitTrimCount(
  trackMock: RegisteredMockObject,
  count: number,
): void {
  expectDuplicateCalled(trackMock);
  expectCreateMidiClipCount(trackMock, count);
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
    // The warning text names the problem so the model can correct it.
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining('Invalid split format: "invalid"'),
    );
  });

  it("treats an all-empty split spec as invalid format", () => {
    const { mockClip, warnings } = setupPrepareTest();

    // "," has only empty parts, so parseSplitPoints returns [] (empty, not null).
    // That must be reported as invalid format, not silently accepted as no-op.
    const result = prepareSplitParams(",", [mockClip], warnings);

    expect(result).toBeNull();
    expect(warnings.has("split-invalid-format")).toBe(true);
  });

  it("should reject the whole split when any point is malformed", () => {
    const { mockClip, warnings } = setupPrepareTest();

    // "2|1" alone is valid, but a single malformed part must invalidate the whole
    // list (return null) rather than silently dropping it and splitting anyway.
    const result = prepareSplitParams(
      "2|1, notaposition",
      [mockClip],
      warnings,
    );

    expect(result).toBeNull();
    expect(warnings.has("split-invalid-format")).toBe(true);
  });

  it("should not re-warn about invalid format when already warned", () => {
    const { mockClip } = setupPrepareTest();
    const warnings = new Set(["split-invalid-format"]);

    vi.clearAllMocks();

    prepareSplitParams("invalid", [mockClip], warnings);

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("Invalid split format"),
    );
  });

  it("should not re-warn about too many points when already warned", () => {
    const { mockClip } = setupPrepareTest();
    const warnings = new Set(["split-max-exceeded"]);
    const manyPoints = Array.from({ length: 33 }, (_, i) => `${i + 2}|1`).join(
      ", ",
    );

    vi.clearAllMocks();

    prepareSplitParams(manyPoints, [mockClip], warnings);

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("Too many split points"),
    );
  });

  it("should not re-warn about no valid points when already warned", () => {
    const { mockClip } = setupPrepareTest();
    const warnings = new Set(["split-no-valid-points"]);

    vi.clearAllMocks();

    prepareSplitParams("1|1", [mockClip], warnings);

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("No valid split points"),
    );
  });

  it("should allow exactly MAX_SPLIT_POINTS points (boundary is > not >=)", () => {
    const { mockClip, warnings } = setupPrepareTest();

    // 32 points is at the cap, not over it — it must be accepted, not rejected.
    const points = Array.from({ length: 32 }, (_, i) => `${i + 2}|1`).join(
      ", ",
    );
    const result = prepareSplitParams(points, [mockClip], warnings);

    expect(result).toHaveLength(32);
    expect(warnings.has("split-max-exceeded")).toBe(false);
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
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("No valid split points"),
    );
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
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Too many split points"),
    );
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
  it("should split looped clips at specified positions", () => {
    const { callState, mockClip, clips } = setupSplitTest();

    // Split a 16-beat clip at 4 and 8 beats (2|1 and 3|1 in 4/4)
    performSplitting([mockClip], [4, 8], clips, HOLDING_AREA);

    // Should create segments via duplication
    expectDuplicateCalled(callState.trackMock);
  });

  it("should skip clips where all split points are beyond clip length", () => {
    // 4-beat clip
    const { callState, mockClip, clips } = setupSplitTest({
      looping: true,
      endTime: 4.0,
      loopEnd: 4.0,
    });

    // Split points at 8 and 12 beats are beyond 4-beat clip
    performSplitting([mockClip], [8, 12], clips, HOLDING_AREA);

    // Should not create any duplicates
    expectDuplicateNotCalled(callState.trackMock);

    // Should warn (not silently no-op) so the model can recover. The clip is
    // 4 beats (1 bar) long, so its clip-local end is 2|1.
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("split skipped for clip clip_1"),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("before its end at 2|1"),
    );
  });

  it("should warn and abort when duplication fails", () => {
    const { callState, mockClip, clips } = setupSplitTest();

    // Make duplicate_clip_to_arrangement return "0" (non-existent)
    callState.trackMock.call.mockImplementation((method: string) => {
      if (method === "duplicate_clip_to_arrangement") {
        return ["id", "0"];
      }

      return undefined;
    });

    performSplitting([mockClip], [4], clips, HOLDING_AREA);

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Failed to duplicate"),
    );
  });

  it("should split unlooped MIDI clips using unified algorithm", () => {
    const { callState, mockClip, clips } = setupSplitTest(EIGHT_BEAT_UNLOOPED);

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
    const { callState, mockClip, clips } = setupSplitTest(EIGHT_BEAT_LOOPED);
    const dups = overrideWithDuplicateCounter(callState.trackMock);

    // Split points: 4 (valid), 12 (beyond clip end)
    performSplitting([mockClip], [4, 12], clips, HOLDING_AREA);

    // Optimized algorithm for 2 segments:
    // Step 1: 1 duplicate source to holding
    // Step 4: 1 moveClipFromHolding for last segment (= 1 duplicate)
    // Total: 2 duplicates (segment 0 stays in place via right-trim)
    // The point at 12 should be filtered out (would add 1 more if not)
    expect(dups.count).toBe(2);
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

    // Audio splitting needs scene/slot for createAndDeleteTempClip
    // Re-register live_set with scenes property
    registerMockObject("live_set", {
      path: "live_set",
      type: "Song",
      properties: {
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: ["id", "scene_1"],
      },
    });
    registerMockObject("scene_1", {
      path: "live_set scenes 0",
      properties: { is_empty: 1 },
    });

    // Split an 8-beat unlooped audio clip at 4 beats
    performSplitting([mockClip], [4], clips, {
      holdingAreaStartBeats: 40000,
      silenceWavPath: "/tmp/silence.wav",
    });

    // Should duplicate for audio content
    expectDuplicateCalled(callState.trackMock);
    // Audio trims route through create_audio_clip in a session slot, never
    // create_midi_clip — so a MIDI-vs-audio misdetection would show up here.
    expectCreateMidiClipCount(callState.trackMock, 0);
  });

  it("should split into 3 segments exercising middle segment extraction", () => {
    const { callState, mockClip, clips } = setupSplitTest(TWELVE_BEAT_LOOPED);

    // Split a 12-beat clip at 4 and 8 beats → 3 segments
    performSplitting([mockClip], [4, 8], clips, HOLDING_AREA);

    // Optimized algorithm for 3 segments:
    // Step 1: 1 duplicate source to holding
    // Step 3: 1 dup middle segment + 1 moveClipFromHolding (middle)
    // Step 4: 1 moveClipFromHolding (last segment)
    // Total: 4 duplicates
    expect(callState.duplicateCount).toBe(4);
  });

  it("places every segment at its exact arrangement position (3-segment split)", () => {
    const clipId = "clip_1";

    // start_time 100, end_time 112 → clipLength 12, so `end - start` (not
    // `end + start`) is exercised. Split at 4 and 8 → boundaries [0,4,8,12].
    const { callState } = setupClipSplittingMocks(clipId, {
      looping: true,
      startTime: 100,
      endTime: 112,
      loopEnd: 4,
    });
    const { mockClip, clips } = createPerformContext(clipId);

    performSplitting([mockClip], [4, 8], clips, HOLDING_AREA);

    const calls = callState.trackMock.call.mock.calls;
    const dupPositions = calls
      .filter((c: unknown[]) => c[0] === "duplicate_clip_to_arrangement")
      .map((c: unknown[]) => c[2]);

    // Step 1 source→holding at 40000; Step 3 middle works at
    // holdingAreaStart + 1*(clipLength 12 + 4) = 40016, then moves to
    // clipArrangementStart 100 + segStart 4 = 104; Step 4 last moves to
    // clipArrangementStart 100 + lastSegStart 8 = 108.
    expect(dupPositions).toStrictEqual([40000, 40016, 104, 108]);

    // Step 2 right-trim seg0: temp at start 100 + seg0End 4 = 104, length
    // clipLength 12 - seg0End 4 = 8.
    expect(calls).toContainEqual(["create_midi_clip", 104, 8]);
    // Step 3 middle left-trim at workPos 40016, length segStart 4; right-trim at
    // workPos 40016 + segEnd 8 = 40024, length clipLength 12 - segEnd 8 = 4.
    expect(calls).toContainEqual(["create_midi_clip", 40016, 4]);
    expect(calls).toContainEqual(["create_midi_clip", 40024, 4]);
    // Step 4 last-segment left-trim at sourcePos 40000, length lastSegStart 8.
    expect(calls).toContainEqual(["create_midi_clip", 40000, 8]);
  });

  it("excludes a split point that lands exactly on the clip end", () => {
    // 8-beat clip. A split at 8 is the clip's very end (p < clipLength, not <=),
    // so it must be dropped, leaving a single valid point at 4 → 2 duplicates.
    const { callState, mockClip, clips } = setupSplitTest(EIGHT_BEAT_LOOPED);
    const dups = overrideWithDuplicateCounter(callState.trackMock);

    performSplitting([mockClip], [4, 8], clips, HOLDING_AREA);

    expect(dups.count).toBe(2);
  });

  it("should warn and skip when middle segment duplication fails", () => {
    const { callState, mockClip, clips } = setupSplitTest(TWELVE_BEAT_LOOPED);

    // First dup succeeds (source to holding), second fails (middle segment)
    const dups = overrideWithDuplicateCounter(callState.trackMock, {
      failOnDuplicate: 2,
    });

    // Split at 4 and 8 → 3 segments, but middle dup fails
    performSplitting([mockClip], [4, 8], clips, HOLDING_AREA);

    // Should warn about the failed middle segment
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Failed to duplicate source for middle segment"),
    );

    // Should still complete: source dup (1) + failed middle (1) + last move (1) = 3
    expect(dups.count).toBe(3);
  });

  it("should rescan split clips replacing stale references with fresh ones", () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    mockArrangementClipsRescan(callState.trackMock, [
      ["fresh_1", 0],
      ["fresh_2", 4],
    ]);

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

    mockArrangementClipsRescan(callState.trackMock, [["fresh_1", 0]]);

    const mockClip = LiveAPI.from(`id ${clipId}`);

    // Pass an empty clips array so staleIndex will be -1
    const clips: LiveAPI[] = [];

    performSplitting([mockClip], [4], clips, {
      holdingAreaStartBeats: 40000,
    });

    // clips array should remain empty since stale clip was not found
    expect(clips).toHaveLength(0);
  });

  it("keeps only fresh clips whose start falls inside the original clip's range", () => {
    const clipId = "clip_1";

    // Original clip_1 occupies [0,16), so only fresh clips starting in that
    // half-open range survive the rescan filter.
    const { callState } = setupClipSplittingMocks(clipId);

    const freshDefs: Array<[string, number]> = [
      ["fresh_in1", 0], // at range start → included
      ["fresh_in2", 8], // mid-range → included
      ["fresh_below", -5], // before range start → excluded (lower bound)
      ["fresh_at_end", 16], // exactly at range end → excluded (upper is `<`)
      ["fresh_above", 100], // past range end → excluded (upper bound)
    ];

    mockArrangementClipsRescan(callState.trackMock, freshDefs);

    const mockClip = LiveAPI.from(`id ${clipId}`);
    const clips = [mockClip];

    performSplitting([mockClip], [4], clips, { holdingAreaStartBeats: 40000 });

    expect(clips.map((c) => c.id)).toStrictEqual(["fresh_in1", "fresh_in2"]);
  });

  it("replaces only the stale clip, leaving unrelated clips in place", () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    mockArrangementClipsRescan(callState.trackMock, [["fresh_1", 0]]);

    const decoy = LiveAPI.from("id decoy");
    const mockClip = LiveAPI.from(`id ${clipId}`);
    // The stale clip is at index 1; the decoy at index 0 must be untouched.
    const clips = [decoy, mockClip];

    performSplitting([mockClip], [4], clips, { holdingAreaStartBeats: 40000 });

    expect(clips[0]!.id).toBe("decoy");
    expect(clips.some((c) => c.id === "fresh_1")).toBe(true);
    expect(clips.some((c) => c.id === clipId)).toBe(false);
  });

  // A split point within EPSILON of either clip edge used to survive the bounds
  // filter and then skip its trim, leaving a span the segment moves assume was
  // vacated still occupied. Those moves skip the overlap clear, so Live crashed
  // on the next duplicate. The filter now rejects such points outright.
  it.each([
    ["within EPSILON of the clip end", EIGHT_BEAT_LOOPED, [7.9999]],
    ["within EPSILON of the clip start", EIGHT_BEAT_LOOPED, [0.0005]],
    ["at both edges", TWELVE_BEAT_LOOPED, [0.0005, 11.9995]],
  ])("rejects a split point %s", (_label, clipProps, points) => {
    const { callState, mockClip, clips } = setupSplitTest(clipProps);

    performSplitting([mockClip], points, clips, HOLDING_AREA);

    // Nothing is duplicated or trimmed: the clip is left exactly as it was.
    expect(callState.trackMock.call).not.toHaveBeenCalled();
  });

  it("still splits at a point just outside the safety margin", () => {
    // Guards the margin against being widened into ordinary split positions.
    const { callState, mockClip, clips } = setupSplitTest(EIGHT_BEAT_LOOPED);

    performSplitting([mockClip], [0.002], clips, HOLDING_AREA);

    expectSplitTrimCount(callState.trackMock, 2);
  });
});
