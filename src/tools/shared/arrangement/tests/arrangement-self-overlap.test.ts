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
  tilingTrackMethods,
} from "./arrangement-tiling-test-helpers.ts";
import {
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
    // Give the session clip a range that WOULD overlap [0,4] if the guard were
    // skipped, so the is_arrangement_clip check is observable via the result.
    setupClip("100", {
      properties: { is_arrangement_clip: 0, start_time: 0, end_time: 4 },
    });

    expect(sourceOverlapsTarget("100", 0, 4)).toBe(false);
  });

  it("returns false when the source lies entirely after the placement range", () => {
    // Source [10,14]; a placement at [0,4] ends before the source starts, so
    // `sourceStart < targetEnd` (10 < 4) is false — no overlap.
    setupClip("100", {
      properties: { is_arrangement_clip: 1, start_time: 10, end_time: 14 },
    });

    expect(sourceOverlapsTarget("100", 0, 4)).toBe(false);
  });

  it("returns false when the source starts exactly at the placement's end", () => {
    // Source [4,8]; placement [0,4] ends exactly where the source starts. The
    // strict `sourceStart < targetEnd` (4 < 4) makes this adjacent, not overlap.
    setupClip("100", {
      properties: { is_arrangement_clip: 1, start_time: 4, end_time: 8 },
    });

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

    // The full copy the second duplicate places at the target ("500").
    const { trackMock, result } = runTwoDupSelfOverlap(4);

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
    const { trackMock, result } = runTwoDupSelfOverlap(199);

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

  it("derives the source length from end minus start for a non-zero-start clip", () => {
    // Source [10,26] (length 16, start_time 10) self-overlaps target 12. The
    // holding area must clear target + length (12 + 16 = 28): max(maxEnd 26, 28) +
    // 100 = 128. A start+end length (36) would push it to 148 instead.
    setupClip("100", {
      properties: { is_arrangement_clip: 1, start_time: 10, end_time: 26 },
    });
    setupClip("400", {
      properties: { is_arrangement_clip: 1, start_time: 128, end_time: 144 },
    });
    const { trackMock } = runTwoDupSelfOverlap(12);

    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 100",
      128,
    );
  });

  it("computes the holding area from the track's real arrangement clips", () => {
    // A far existing clip [100,500] must push the holding area past it: max(500,
    // target 2 + length 4 = 6) + 100 = 600. Reading the wrong child list would
    // collapse maxEnd to 0 and land the holding copy at 106.
    setupClip("100", {
      properties: { is_arrangement_clip: 1, start_time: 0, end_time: 4 },
    });
    setupArrangementClip("900", 0, { start_time: 100, end_time: 500 }, 1);
    setupClip("400", {
      properties: { is_arrangement_clip: 1, start_time: 600, end_time: 604 },
    });
    setupClip("500", { properties: { is_arrangement_clip: 1 } });
    const trackMock = setupTrack(0, {
      properties: { arrangement_clips: ["id", "100", "id", "900"] },
      methods: tilingTrackMethods(),
    });

    duplicateSelfOverlappingClip(
      LiveAPI.from(trackMock.path),
      "100",
      2,
      true,
      mockContext,
    );

    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 100",
      600,
    );
  });

  it("throws with a self-overlap context when the holding dup silently fails", () => {
    // The first dup (source → holding) failing must abort with a context that
    // names the self-overlap operation, so the source is never mutated.
    setupClip("100", {
      properties: { is_arrangement_clip: 1, start_time: 0, end_time: 16 },
    });
    const trackMock = setupTrack(0, {
      properties: { arrangement_clips: ["id", "100"] },
      methods: {
        duplicate_clip_to_arrangement: () => ["id", 0],
        delete_clip: () => null,
      },
    });

    expect(() =>
      duplicateSelfOverlappingClip(
        LiveAPI.from(trackMock.path),
        "100",
        4,
        true,
        mockContext,
      ),
    ).toThrow(/self-overlap dup-to-holding/);
  });
});

/**
 * Run the two-duplicate self-overlap workaround. The caller registers the source
 * ("100") and holding ("400") clips; this sets up "500" (the placed full copy),
 * the track with its dup/create/delete methods, and invokes the workaround.
 * @param target - Target arrangement position for the duplicate
 * @returns The track mock and the resulting clip
 */
function runTwoDupSelfOverlap(target: number): {
  trackMock: ReturnType<typeof setupTrack>;
  result: ReturnType<typeof duplicateSelfOverlappingClip>;
} {
  setupClip("500", { properties: { is_arrangement_clip: 1 } });

  const trackMock = setupTrack(0, {
    properties: { arrangement_clips: ["id", "100"] },
    methods: tilingTrackMethods(),
  });

  const result = duplicateSelfOverlappingClip(
    LiveAPI.from(trackMock.path),
    "100",
    target,
    true,
    mockContext,
  );

  return { trackMock, result };
}
