// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mockContext,
  setupArrangementClip,
  setupClip,
  setupTrack,
} from "./arrangement-tiling-test-helpers.ts";
import {
  clearClipAtDuplicateTarget,
  duplicateSelfOverlappingClip,
  setArrangementDuplicateCrashWorkaround,
  sourceOverlapsTarget,
} from "../arrangement-tiling-workaround.ts";

beforeEach(() => {
  vi.clearAllMocks();
  setArrangementDuplicateCrashWorkaround(true);
});

afterEach(() => {
  setArrangementDuplicateCrashWorkaround(true);
});

/**
 * Sets up a source clip, existing arrangement clip, and holding clip with
 * a track mock that supports duplicate/create/delete operations.
 * Used by tests that exercise the holding-clip workaround (after-only and
 * mid-clip overlap scenarios).
 * @param source - start/end times for the source clip
 * @param source.start - source clip start time
 * @param source.end - source clip end time
 * @param existing - start/end times for the existing arrangement clip
 * @param existing.start - existing clip start time
 * @param existing.end - existing clip end time
 * @param holding - start/end times for the holding clip created by duplication
 * @param holding.start - holding clip start time
 * @param holding.end - holding clip end time
 * @returns Object containing the track mock
 */
function setupHoldingClipScenario(
  source: { start: number; end: number },
  existing: { start: number; end: number },
  holding: { start: number; end: number },
) {
  setupClip("100", {
    properties: {
      is_arrangement_clip: 1,
      start_time: source.start,
      end_time: source.end,
    },
  });

  const existingClip = setupArrangementClip("200", 0, {
    start_time: existing.start,
    end_time: existing.end,
  });

  setupClip("400", {
    properties: {
      is_arrangement_clip: 1,
      start_time: holding.start,
      end_time: holding.end,
    },
  });

  let dupCount = 0;

  return setupTrack(0, {
    properties: {
      arrangement_clips: ["id", existingClip.id],
    },
    methods: {
      duplicate_clip_to_arrangement: () => {
        dupCount++;

        return dupCount === 1 ? ["id", "400"] : ["id", "500"];
      },
      create_midi_clip: () => ["id", "300"],
      delete_clip: () => null,
    },
  });
}

describe("clearClipAtDuplicateTarget", () => {
  it("does nothing when source is a session clip", () => {
    setupClip("100", {
      properties: {
        is_arrangement_clip: 0,
      },
    });
    const trackMock = setupTrack(0);

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      0,
      true,
      mockContext,
    );

    expect(trackMock.call).not.toHaveBeenCalled();
  });

  it("does nothing when no arrangement clip overlaps target range", () => {
    // Source: 4 beats long (start_time=8, end_time=12), target position=0
    // Target range: 0 to 4. Existing clip at 16-20 doesn't overlap.
    const trackMock = runClearTargetExpectingNoOp({
      sourceStart: 8,
      sourceEnd: 12,
      existingStart: 16,
      existingEnd: 20,
      targetPosition: 0,
    });

    expect(trackMock.call).not.toHaveBeenCalled();
  });

  it("deletes clip when fully contained in target range", () => {
    // Source: 4 beats long, target position=8
    // Target range: 8 to 12. Existing clip at 8-12 fully contained.
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 16,
        end_time: 20,
      },
    });

    const existingClip = setupArrangementClip("200", 0, {
      start_time: 8,
      end_time: 12,
    });

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", existingClip.id],
      },
      methods: {
        delete_clip: () => null,
      },
    });

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      8,
      true,
      mockContext,
    );

    expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 200");
  });

  it("preserves after portion via holding for after-only overlap", () => {
    // Source: 4 beats long (start_time=20, end_time=24), target position=8
    // Target range: 8 to 12. Existing clip at 10-14 starts within target,
    // extends past — preserves the [12,14] after portion via holding.
    const trackMock = setupHoldingClipScenario(
      { start: 20, end: 24 },
      { start: 10, end: 14 },
      { start: 114, end: 118 },
    );

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      8,
      true,
      mockContext,
    );

    // Step 1: Dup to holding (maxEnd=14 + 100 = 114)
    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 200",
      114,
    );

    // Step 2: Delete original (no before portion to keep)
    expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 200");

    // Step 3: Left-trim holding (targetEnd 12 - clipStart 10 = 2 beats)
    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 114, 2);

    // Step 4: Move holding clip to targetEnd (12)
    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 400",
      12,
    );
  });

  it("preserves both sides for mid-clip overlap", () => {
    // Source: 2 beats long (start_time=40, end_time=42), target position=12
    // Target range: 12 to 14. Existing clip at 8-20 starts before target
    // and extends past it — triggers split to preserve before+after portions.
    const trackMock = setupHoldingClipScenario(
      { start: 40, end: 42 },
      { start: 8, end: 20 },
      { start: 120, end: 132 },
    );

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      12,
      true,
      mockContext,
    );

    // Step 1: Duplicate to holding area (maxEnd=20 + 100 = 120)
    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 200",
      120,
    );

    // Step 2: Right-trim original at targetPosition (12 to clipEnd 20 = 8 beats)
    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 12, 8);

    // Step 3: Left-trim holding to keep "after" (targetEnd 14 - clipStart 8 = 6 beats)
    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 120, 6);

    // Step 4: Move holding clip to targetEnd (14)
    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 400",
      14,
    );
  });

  it("does nothing when existing clip ends exactly at target position", () => {
    // Source: 4 beats long (start_time=20, end_time=24), target position=8
    // Target range: 8 to 12. Existing clip at 4-8 ends at target start (no overlap).
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 20,
        end_time: 24,
      },
    });

    const existingClip = setupArrangementClip("200", 0, {
      start_time: 4,
      end_time: 8,
    });

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", existingClip.id],
      },
    });

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      8,
      true,
      mockContext,
    );

    expect(trackMock.call).not.toHaveBeenCalled();
  });

  it("does nothing when workaround is disabled", () => {
    setArrangementDuplicateCrashWorkaround(false);

    const trackMock = runClearTargetExpectingNoOp({
      sourceStart: 0,
      sourceEnd: 4,
      existingStart: 0,
      existingEnd: 4,
      targetPosition: 0,
    });

    expect(trackMock.call).not.toHaveBeenCalled();
  });

  it("right-trims clip for before-only overlap", () => {
    // Source: 4 beats long (start_time=20, end_time=24), target position=8
    // Target range: 8 to 12. Existing clip at 4-10 starts before target,
    // ends within — right-trims to keep [4,8].
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 20,
        end_time: 24,
      },
    });

    const existingClip = setupArrangementClip("200", 0, {
      start_time: 4,
      end_time: 10,
    });

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", existingClip.id],
      },
      methods: {
        create_midi_clip: () => ["id", "300"],
        delete_clip: () => null,
      },
    });

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      8,
      true,
      mockContext,
    );

    // Right-trim: temp at targetPosition (8), length = clipEnd - target = 10 - 8 = 2
    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 8, 2);
    expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 300");
    expect(trackMock.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );
  });

  it("checks multiple arrangement clips for overlap", () => {
    // Source: 4 beats long, target position=16
    // Target range: 16 to 20. Clip1 at 0-4 doesn't overlap, clip2 at 16-20 does.
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 24,
        end_time: 28,
      },
    });

    const clip1 = setupArrangementClip("200", 0, {
      start_time: 0,
      end_time: 4,
    });

    const clip2 = setupArrangementClip(
      "201",
      0,
      {
        start_time: 16,
        end_time: 20,
      },
      1,
    );

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", clip1.id, "id", clip2.id],
      },
      methods: {
        delete_clip: () => null,
      },
    });

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      16,
      true,
      mockContext,
    );

    // Full containment: clip [16,20] fully within target [16,20] — delete
    expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 201");
  });

  it("returns false and leaves the source untouched when it overlaps its own target", () => {
    // Source [8,20] duplicated to target 12 (targetEnd 24): the source itself is
    // in arrangement_clips and overlaps [12,24]. clearClipAtDuplicateTarget must
    // NOT clear it — trimming/deleting it would destroy the content being
    // duplicated — so it returns false and leaves the source untouched. The
    // caller then routes the duplicate through the holding area
    // (duplicateSelfOverlappingClip) instead of corrupting the source.
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 8,
        end_time: 20,
      },
    });

    const trackMock = setupTrack(0, {
      properties: {
        // The source clip itself is on the track at an overlapping position —
        // exactly the case the original tests never registered (they listed only
        // a non-source overlapping clip, so the source never entered the loop).
        arrangement_clips: ["id", "100"],
      },
      methods: {
        create_midi_clip: () => ["id", "300"],
        delete_clip: () => null,
        duplicate_clip_to_arrangement: () => ["id", "400"],
      },
    });

    const safe = clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      12,
      true,
      mockContext,
    );

    expect(safe).toBe(false);
    // The source must be untouched: no trim, no delete, no duplicate.
    expect(trackMock.call).not.toHaveBeenCalled();
  });

  it("returns true and clears other clips when the source itself does not overlap the target", () => {
    // Source [0,4] duplicated to target 16 (targetEnd 20). The source is listed
    // in arrangement_clips but doesn't overlap [16,20]; another clip [16,20] does.
    // Having the source in the list must not break normal clearing of others.
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 0,
        end_time: 4,
      },
    });

    const otherClip = setupArrangementClip(
      "200",
      0,
      {
        start_time: 16,
        end_time: 20,
      },
      1,
    );

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", "100", "id", otherClip.id],
      },
      methods: {
        delete_clip: () => null,
      },
    });

    const safe = clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      16,
      true,
      mockContext,
    );

    expect(safe).toBe(true);
    // The non-source overlapping clip [16,20] is fully contained → deleted.
    expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 200");
  });

  it("throws and leaves original intact when dup-to-holding silently fails (after-only)", () => {
    // After-only overlap: existing [10,14], target [8,12].
    // Without protection, the original would be deleted with no replacement
    // → "after" portion [12,14] would be lost. Verify the throw fires before
    // any mutation of the original clip.
    const trackMock = setupSilentFailHoldingScenario({
      sourceStart: 20,
      sourceEnd: 24,
      existingStart: 10,
      existingEnd: 14,
    });

    expect(() =>
      clearClipAtDuplicateTarget(
        LiveAPI.from(trackMock.path),
        "100",
        8,
        true,
        mockContext,
      ),
    ).toThrow(/duplicate_clip_to_arrangement returned no clip/);

    expect(trackMock.call).not.toHaveBeenCalledWith("delete_clip", "id 200");
    expect(trackMock.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      8,
      expect.anything(),
    );
  });

  it("throws and leaves original intact when dup-to-holding silently fails (mid-clip)", () => {
    // Mid-clip overlap: existing [8,20], target [12,14].
    // Without protection, the original would be right-trimmed at 12 and lose
    // the "after" portion [14,20]. Verify the throw fires before that trim.
    const trackMock = setupSilentFailHoldingScenario({
      sourceStart: 40,
      sourceEnd: 42,
      existingStart: 8,
      existingEnd: 20,
    });

    expect(() =>
      clearClipAtDuplicateTarget(
        LiveAPI.from(trackMock.path),
        "100",
        12,
        true,
        mockContext,
      ),
    ).toThrow(/duplicate_clip_to_arrangement returned no clip/);

    expect(trackMock.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      12,
      expect.anything(),
    );
    expect(trackMock.call).not.toHaveBeenCalledWith("delete_clip", "id 200");
  });
});

describe("sourceOverlapsTarget", () => {
  it("returns false when the crash workaround is disabled", () => {
    setArrangementDuplicateCrashWorkaround(false);
    setupClip("100", {
      properties: { is_arrangement_clip: 1, start_time: 0, end_time: 4 },
    });

    // Source [0,4] would overlap a placement at [2,6], but with the workaround
    // off we defer to Live entirely (matches clearClipAtDuplicateTarget's no-op).
    expect(sourceOverlapsTarget("100", 2, 4)).toBe(false);
  });

  it("returns false when the source is a session clip", () => {
    setupClip("100", { properties: { is_arrangement_clip: 0 } });

    expect(sourceOverlapsTarget("100", 0, 4)).toBe(false);
  });

  it("returns true when the source overlaps the target placement range", () => {
    // Source [0,16] (4-bar clip); a partial tile of length 4 at position 4
    // covers [4,8], which is inside the source — placing it would trim the source.
    setupClip("100", {
      properties: { is_arrangement_clip: 1, start_time: 0, end_time: 16 },
    });

    expect(sourceOverlapsTarget("100", 4, 4)).toBe(true);
  });

  it("returns false when the placement abuts the source's end (the tiling case)", () => {
    // Source [0,4]; tiling always starts at the source's end, so a tile at
    // position 4 (range [4,8]) is adjacent, not overlapping — the common path.
    setupClip("100", {
      properties: { is_arrangement_clip: 1, start_time: 0, end_time: 4 },
    });

    expect(sourceOverlapsTarget("100", 4, 4)).toBe(false);
  });
});

describe("duplicateSelfOverlappingClip", () => {
  it("copies the source to holding, then overwrites the original with a full copy", () => {
    // Source [0,16] (a 4-bar clip in 4/4) duplicated to target 4 — one bar
    // forward, so it overlaps its own target range [4,20]. Direct duplication is
    // impossible (Ableton crashes; trimming the source first would truncate the
    // content). Routing through the holding area trims the original to its first
    // bar [0,4] and places a full 4-bar copy at [4,20].
    setupClip("100", {
      properties: { is_arrangement_clip: 1, start_time: 0, end_time: 16 },
    });

    // The holding copy the first duplicate creates. The holding area clears the
    // target placement (target 4 + length 16 = 20) as well as the existing clips
    // (maxEnd 16), so it starts at max(16, 20) + 100 = 120.
    setupClip("400", {
      properties: { is_arrangement_clip: 1, start_time: 120, end_time: 136 },
    });

    // The full copy the second duplicate places at the target.
    setupClip("500", { properties: { is_arrangement_clip: 1 } });

    let dupCount = 0;

    const trackMock = setupTrack(0, {
      properties: { arrangement_clips: ["id", "100"] },
      methods: {
        duplicate_clip_to_arrangement: () => {
          dupCount++;

          return dupCount === 1 ? ["id", "400"] : ["id", "500"];
        },
        create_midi_clip: () => ["id", "300"],
        delete_clip: () => null,
      },
    });

    const result = duplicateSelfOverlappingClip(
      LiveAPI.from(trackMock.path),
      "100",
      4,
      true,
      mockContext,
    );

    // Step 1: copy the source to the holding area, past both the existing clips
    // (maxEnd 16) and the target placement (4 + 16 = 20): max(16, 20) + 100 = 120.
    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 100",
      120,
    );

    // Step 2: trim the ORIGINAL to its "before" portion (right-trim at target 4,
    // length clipEnd 16 - target 4 = 12) so the full copy can overwrite [4,20].
    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 4, 12);

    // Step 3: place the full copy at the target from the untouched holding clip.
    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 400",
      4,
    );

    // Step 4: clean up the holding clip.
    expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 400");

    // The placed full-length copy is returned (never the trimmed original).
    expect(result.id).toBe("500");
  });

  it("pushes the holding area past the target placement for a clip longer than the gap", () => {
    // Regression: a clip longer than HOLDING_AREA_GAP_BEATS (100) moved far
    // enough forward that its full-length target copy would reach a holding area
    // pinned only to maxEnd. Source [0,200] (50 bars) duplicated to target 199
    // self-overlaps [199,399]. With the old `maxEnd + 100` holding position
    // (300), the placed copy [199,399] overlaps the holding clip [300,500];
    // moveClipFromHolding's clearClipAtDuplicateTarget would then read the
    // holding clip as self-overlapping, skip clearing the original [0,200], and
    // duplicate onto a still-overlapping clip — exactly Ableton's crash. The
    // holding area must clear the target extent: max(200, 199 + 200) + 100 = 499.
    setupClip("100", {
      properties: { is_arrangement_clip: 1, start_time: 0, end_time: 200 },
    });

    // The holding copy at the corrected position (past the target extent 399).
    setupClip("400", {
      properties: { is_arrangement_clip: 1, start_time: 499, end_time: 699 },
    });
    setupClip("500", { properties: { is_arrangement_clip: 1 } });

    let dupCount = 0;

    const trackMock = setupTrack(0, {
      properties: { arrangement_clips: ["id", "100"] },
      methods: {
        duplicate_clip_to_arrangement: () => {
          dupCount++;

          return dupCount === 1 ? ["id", "400"] : ["id", "500"];
        },
        create_midi_clip: () => ["id", "300"],
        delete_clip: () => null,
      },
    });

    const result = duplicateSelfOverlappingClip(
      LiveAPI.from(trackMock.path),
      "100",
      199,
      true,
      mockContext,
    );

    // The holding copy lands past the target placement (399), not at maxEnd + 100
    // (300) — so the holding clip cannot overlap the target copy.
    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 100",
      499,
    );

    // Because the holding area cleared the target, the ORIGINAL is recognized as
    // an "other" overlapping clip and right-trimmed at 199 (length 200 - 199 = 1)
    // — it is no longer left in place to overlap the target and crash Ableton.
    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 199, 1);

    // The full copy is then placed at the target and the holding clip removed.
    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 400",
      199,
    );
    expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 400");
    expect(result.id).toBe("500");
  });
});

/**
 * Set up mocks for a clearClipAtDuplicateTarget test that expects no track calls.
 * @param opts - Source clip times, existing clip times, and target position
 * @param opts.sourceStart - Source clip start time
 * @param opts.sourceEnd - Source clip end time
 * @param opts.existingStart - Existing clip start time
 * @param opts.existingEnd - Existing clip end time
 * @param opts.targetPosition - Target position for duplicate
 * @returns The track mock for assertion
 */
function runClearTargetExpectingNoOp(opts: {
  sourceStart: number;
  sourceEnd: number;
  existingStart: number;
  existingEnd: number;
  targetPosition: number;
}): ReturnType<typeof setupTrack> {
  const { existingClip } = setupSourceAndExistingClips(opts);

  const trackMock = setupTrack(0, {
    properties: {
      arrangement_clips: ["id", existingClip.id],
    },
  });

  clearClipAtDuplicateTarget(
    LiveAPI.from(trackMock.path),
    "100",
    opts.targetPosition,
    true,
    mockContext,
  );

  return trackMock;
}

/**
 * Register the source clip "100" and the overlapping existing clip "200" used
 * by the clearClipAtDuplicateTarget scenarios.
 *
 * @param opts - Source and existing clip times
 * @param opts.sourceStart - Source clip start time
 * @param opts.sourceEnd - Source clip end time
 * @param opts.existingStart - Existing (overlapping) clip start time
 * @param opts.existingEnd - Existing (overlapping) clip end time
 * @returns The existing arrangement clip mock (the source is in the registry)
 */
function setupSourceAndExistingClips(opts: {
  sourceStart: number;
  sourceEnd: number;
  existingStart: number;
  existingEnd: number;
}): { existingClip: ReturnType<typeof setupArrangementClip> } {
  setupClip("100", {
    properties: {
      is_arrangement_clip: 1,
      start_time: opts.sourceStart,
      end_time: opts.sourceEnd,
    },
  });

  const existingClip = setupArrangementClip("200", 0, {
    start_time: opts.existingStart,
    end_time: opts.existingEnd,
  });

  return { existingClip };
}

/**
 * Set up a scenario where the dup-to-holding call silently fails by returning
 * ["id", 0]. Used to test that destructive follow-up steps (trim/delete of
 * the original clip) do not run when the holding copy was not created.
 * @param opts - Source clip and existing clip times
 * @param opts.sourceStart - Source clip start time
 * @param opts.sourceEnd - Source clip end time
 * @param opts.existingStart - Existing (overlapping) clip start time
 * @param opts.existingEnd - Existing (overlapping) clip end time
 * @returns The track mock
 */
function setupSilentFailHoldingScenario(opts: {
  sourceStart: number;
  sourceEnd: number;
  existingStart: number;
  existingEnd: number;
}): ReturnType<typeof setupTrack> {
  const { existingClip } = setupSourceAndExistingClips(opts);

  return setupTrack(0, {
    properties: {
      arrangement_clips: ["id", existingClip.id],
    },
    methods: {
      duplicate_clip_to_arrangement: () => ["id", 0],
      create_midi_clip: () => ["id", "300"],
      delete_clip: () => null,
    },
  });
}
