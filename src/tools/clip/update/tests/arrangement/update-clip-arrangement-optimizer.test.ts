// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type ClipPath } from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  computeNonSurvivorClipIds,
  type ClipMoves,
} from "../../helpers/arrangement/update-clip-arrangement-optimizer.ts";

/**
 * Create a mock arrangement clip with the given start/end times.
 * @param clipId - Clip ID
 * @param trackIndex - Track index
 * @param startTime - Arrangement start time in beats
 * @param endTime - Arrangement end time in beats
 * @returns LiveAPI mock clip
 */
function mockArrangementClip(
  clipId: string,
  trackIndex: number,
  startTime: number,
  endTime: number,
): LiveAPI {
  registerMockObject(clipId, {
    path: livePath.track(trackIndex).arrangementClip(0),
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: startTime,
      end_time: endTime,
    },
  });

  return LiveAPI.from(`id ${clipId}`);
}

/**
 * Create a mock session clip.
 * @param clipId - Clip ID
 * @returns LiveAPI mock clip
 */
function mockSessionClip(clipId: string): LiveAPI {
  registerMockObject(clipId, {
    properties: {
      is_arrangement_clip: 0,
    },
  });

  return LiveAPI.from(`id ${clipId}`);
}

/**
 * Create a mock take-lane arrangement clip with the given start/end times.
 * @param clipId - Clip ID
 * @param trackIndex - Parent track index
 * @param laneIndex - Take lane index (0-based, excludes main lane)
 * @param startTime - Arrangement start time in beats
 * @param endTime - Arrangement end time in beats
 * @returns LiveAPI mock clip
 */
function mockTakeLaneClip(
  clipId: string,
  trackIndex: number,
  laneIndex: number,
  startTime: number,
  endTime: number,
): LiveAPI {
  registerMockObject(clipId, {
    path: livePath.track(trackIndex).takeLane(laneIndex).arrangementClip(0),
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: startTime,
      end_time: endTime,
    },
  });

  return LiveAPI.from(`id ${clipId}`);
}

/**
 * Register a mock clip with arbitrary options and return its LiveAPI handle.
 * Used for clips that vary the standard shape (no track path, or non-arrangement
 * clips on a track path).
 * @param clipId - Clip ID
 * @param options - registerMockObject options (path, properties, ...)
 * @returns LiveAPI mock clip
 */
function mockClipRaw(
  clipId: string,
  options: Parameters<typeof registerMockObject>[1],
): LiveAPI {
  registerMockObject(clipId, options);

  return LiveAPI.from(`id ${clipId}`);
}

interface MovesOptions {
  /** arrangementLength, when the call set one for every clip */
  lengthBeats?: number;
  /** Destinations from toPath, keyed by clip id */
  destinationById?: Map<string, ClipPath>;
  /** Per-clip starts, overriding the shared one */
  startBeatsById?: Map<string, number | null>;
}

/**
 * Build the moves the optimizer reads.
 * @param startBeats - Where every clip is headed, or null when the call set none
 * @param options - Per-clip overrides
 * @returns The moves argument
 */
function moves(
  startBeats: number | null,
  options: MovesOptions = {},
): ClipMoves {
  return {
    startBeatsFor: (clip) => options.startBeatsById?.get(clip.id) ?? startBeats,
    lengthBeatsFor: () => options.lengthBeats ?? null,
    destinationById: options.destinationById,
  };
}

describe("computeNonSurvivorClipIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when arrangementStartBeats is null", () => {
    const clips = [mockArrangementClip("1", 0, 0, 8)];

    expect(computeNonSurvivorClipIds(clips, moves(null))).toBeNull();
  });

  it("returns null when arrangementLength is set for every clip", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4),
      mockArrangementClip("2", 0, 4, 12),
    ];

    expect(
      computeNonSurvivorClipIds(clips, moves(16, { lengthBeats: 8 })),
    ).toBeNull();
  });

  it("returns null when only one clip per track", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 8),
      mockArrangementClip("2", 1, 0, 4),
    ];

    expect(computeNonSurvivorClipIds(clips, moves(16))).toBeNull();
  });

  it("returns null for session clips", () => {
    const clips = [mockSessionClip("1"), mockSessionClip("2")];

    expect(computeNonSurvivorClipIds(clips, moves(16))).toBeNull();
  });

  it("identifies non-survivors: A(4), B(8), C(2)", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4), // A: 4 beats
      mockArrangementClip("2", 0, 8, 16), // B: 8 beats
      mockArrangementClip("3", 0, 20, 22), // C: 2 beats
    ];

    const result = computeNonSurvivorClipIds(clips, moves(32));

    // Backwards: C(2)>0 survives, B(8)>2 survives, A(4)<=8 covered by B
    // C survives because it's last (on top), B survives (longest), A is covered
    expect(result).toStrictEqual(new Set(["1"]));
  });

  it("only last survives when all same length", () => {
    const clips = [
      mockArrangementClip("10", 0, 0, 4), // 4 beats
      mockArrangementClip("20", 0, 8, 12), // 4 beats
      mockArrangementClip("30", 0, 16, 20), // 4 beats
    ];

    const result = computeNonSurvivorClipIds(clips, moves(32));

    // Same length: last one survives (4>0), others <=4
    expect(result).toStrictEqual(new Set(["10", "20"]));
  });

  it("returns null when already in descending order (all survive)", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 8), // 8 beats
      mockArrangementClip("2", 0, 12, 16), // 4 beats
      mockArrangementClip("3", 0, 20, 22), // 2 beats
    ];

    // Backwards: C(2)>0, B(4)>2, A(8)>4 — all survive, no non-survivors
    expect(computeNonSurvivorClipIds(clips, moves(32))).toBeNull();
  });

  it("skips single-clip tracks while optimizing multi-clip tracks", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4), // track 0: 4 beats
      mockArrangementClip("2", 0, 8, 16), // track 0: 8 beats
      mockArrangementClip("3", 1, 0, 4), // track 1: lone clip → skipped
    ];

    const result = computeNonSurvivorClipIds(clips, moves(32));

    // Track 0 has multiple clips (A(4) covered by B(8) → "1" non-survivor);
    // track 1's single-clip group is skipped.
    expect(result).toStrictEqual(new Set(["1"]));
  });

  it("handles mixed tracks independently", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4), // track 0: 4 beats
      mockArrangementClip("2", 1, 0, 2), // track 1: 2 beats
      mockArrangementClip("3", 0, 8, 16), // track 0: 8 beats
      mockArrangementClip("4", 1, 4, 10), // track 1: 6 beats
    ];

    const result = computeNonSurvivorClipIds(clips, moves(32));

    // Track 0: A(4) covered by C(8) → A non-survivor
    // Track 1: B(2) covered by D(6) → B non-survivor
    expect(result).toStrictEqual(new Set(["1", "2"]));
  });

  it("handles complex survivor pattern: A(4), B(8), C(2), D(6), E(3)", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4), // A: 4 beats
      mockArrangementClip("2", 0, 8, 16), // B: 8 beats
      mockArrangementClip("3", 0, 20, 22), // C: 2 beats
      mockArrangementClip("4", 0, 24, 30), // D: 6 beats
      mockArrangementClip("5", 0, 32, 35), // E: 3 beats
    ];

    const result = computeNonSurvivorClipIds(clips, moves(40));

    // Backwards: E(3)>0, D(6)>3, C(2)<=6 covered, B(8)>6, A(4)<=8 covered
    // Non-survivors: A(4) and C(2)
    expect(result).toStrictEqual(new Set(["1", "3"]));
  });

  it("excludes take-lane clips so they can't mark main-lane clips as non-survivors", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4), // main lane: 4 beats
      mockTakeLaneClip("2", 0, 0, 0, 16), // take lane: 16 beats — must NOT be counted
    ];

    // With take-lane filtering: track 0 has only one eligible clip (main lane),
    // so optimization doesn't apply and the result is null. Without filtering,
    // the take-lane clip's length (16) would have marked clip "1" non-survivor
    // and the harness would delete it — a real bug for users.
    expect(computeNonSurvivorClipIds(clips, moves(32))).toBeNull();
  });

  it("short-circuits to null for a null arrangementStart even with multi-clip non-survivors", () => {
    const clips = [
      mockArrangementClip("1", 0, 0, 4), // 4 beats
      mockArrangementClip("2", 0, 8, 16), // 8 beats
    ];

    // Track 0 would yield non-survivor "1", but a null arrangementStart must
    // return null before any survivor analysis runs.
    expect(computeNonSurvivorClipIds(clips, moves(null))).toBeNull();
  });

  it("skips null-trackIndex clips so they never form a survivor group", () => {
    const clips = [
      mockClipRaw("501", {
        properties: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0,
          end_time: 4,
        },
      }),
      mockClipRaw("502", {
        properties: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 8,
          end_time: 16,
        },
      }),
    ];

    // Both clips lack a track path (trackIndex null). If they were grouped, the
    // 4-beat clip would be a non-survivor; the null-trackIndex guard drops them.
    expect(computeNonSurvivorClipIds(clips, moves(32))).toBeNull();
  });

  it("excludes session clips (is_arrangement_clip <= 0) from survivor grouping", () => {
    const clips = [
      mockClipRaw("601", {
        path: livePath.track(0).arrangementClip(0),
        properties: {
          is_arrangement_clip: 0,
          is_midi_clip: 1,
          start_time: 0,
          end_time: 4,
        },
      }),
      mockClipRaw("602", {
        path: livePath.track(0).arrangementClip(1),
        properties: {
          is_arrangement_clip: 0,
          is_midi_clip: 1,
          start_time: 8,
          end_time: 16,
        },
      }),
    ];

    // Both are session clips (is_arrangement_clip 0) on track 0. Treated as
    // eligible they would group and mark "601" a non-survivor; the eligibility
    // gate drops them, so no optimization applies.
    expect(computeNonSurvivorClipIds(clips, moves(32))).toBeNull();
  });

  // The hazard toPath destinations introduced: grouped by SOURCE track, the
  // shorter clip is deleted rather than moved because of a sibling that isn't
  // going anywhere near it.
  it("groups by the lane the clips land on, not the one they start from", () => {
    const short = mockArrangementClip("801", 0, 0, 4);
    const long = mockArrangementClip("802", 0, 8, 24);
    const destinations = new Map<string, ClipPath>([
      ["801", { kind: "track", trackIndex: 5 }],
      ["802", { kind: "track", trackIndex: 6 }],
    ]);

    expect(
      computeNonSurvivorClipIds(
        [short, long],
        moves(32, { destinationById: destinations }),
      ),
    ).toBeNull();
  });

  it("marks a non-survivor when two clips land on the same track", () => {
    const short = mockArrangementClip("811", 0, 0, 4);
    const long = mockArrangementClip("812", 1, 8, 24);
    const destinations = new Map<string, ClipPath>([
      ["811", { kind: "track", trackIndex: 5 }],
      ["812", { kind: "track", trackIndex: 5 }],
    ]);

    expect(
      computeNonSurvivorClipIds(
        [short, long],
        moves(32, { destinationById: destinations }),
      ),
    ).toStrictEqual(new Set(["811"]));
  });

  // A slot is off the arrangement timeline and a take lane is re-created one
  // clip at a time, so neither can overwrite what it lands next to here.
  it.each([
    ["a slot", { kind: "slot", trackIndex: 5, sceneIndex: 0 } as ClipPath],
    [
      "a take lane",
      { kind: "take-lane", trackIndex: 0, laneIndex: 0 } as ClipPath,
    ],
  ])("skips a clip moving to %s", (_label, destination) => {
    const short = mockArrangementClip("821", 0, 0, 4);
    const long = mockArrangementClip("822", 0, 8, 24);

    expect(
      computeNonSurvivorClipIds(
        [short, long],
        moves(32, { destinationById: new Map([["821", destination]]) }),
      ),
    ).toBeNull();
  });

  // The clip that overwrites the others has to actually land, or its shorter
  // siblings are deleted to make room for nothing.
  it.each([
    ["is frozen", { is_frozen: 1 }],
    ["takes the wrong clip type", { has_midi_input: 0 }],
  ])("skips a clip whose destination track %s", (_label, properties) => {
    registerMockObject("blocked-track", {
      path: livePath.track(5),
      type: "Track",
      properties,
    });

    const short = mockArrangementClip("831", 0, 0, 4);
    const long = mockArrangementClip("832", 0, 8, 24);
    const destinations = new Map<string, ClipPath>([
      ["831", { kind: "track", trackIndex: 5 }],
      ["832", { kind: "track", trackIndex: 5 }],
    ]);

    expect(
      computeNonSurvivorClipIds(
        [short, long],
        moves(32, { destinationById: destinations }),
      ),
    ).toBeNull();
  });

  it("skips only the clip the destination refuses, not its siblings", () => {
    // Track 5 is MIDI, so the long audio clip can't land there — and the short
    // MIDI clip it would have overwritten must survive.
    const short = mockArrangementClip("841", 0, 0, 4);
    const longAudio = mockClipRaw("842", {
      path: livePath.track(0).arrangementClip(1),
      properties: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        start_time: 8,
        end_time: 24,
      },
    });
    const destinations = new Map<string, ClipPath>([
      ["841", { kind: "track", trackIndex: 5 }],
      ["842", { kind: "track", trackIndex: 5 }],
    ]);

    expect(
      computeNonSurvivorClipIds(
        [short, longAudio],
        moves(32, { destinationById: destinations }),
      ),
    ).toBeNull();
  });

  it("skips clips with null trackIndex", () => {
    registerMockObject("99", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 0,
        end_time: 4,
      },
    });
    // trackIndex defaults to null in mock
    const clip = LiveAPI.from("id 99");

    const clips = [clip, mockArrangementClip("2", 0, 0, 8)];

    // Only one clip on track 0 (clip 99 has null trackIndex), so no optimization
    expect(computeNonSurvivorClipIds(clips, moves(16))).toBeNull();
  });

  // The hazard per-clip positions introduce: grouped by lane alone, the shorter
  // clip is deleted for a sibling that lands somewhere else on the same lane.
  it("optimizes nothing when clips share a lane at different positions", () => {
    const short = mockArrangementClip("901", 0, 0, 4);
    const long = mockArrangementClip("902", 0, 8, 24);

    expect(
      computeNonSurvivorClipIds(
        [short, long],
        moves(null, {
          startBeatsById: new Map([
            ["901", 32],
            ["902", 64],
          ]),
        }),
      ),
    ).toBeNull();
  });

  it("groups only the clips landing at the same position on a lane", () => {
    const short = mockArrangementClip("911", 0, 0, 4);
    const long = mockArrangementClip("912", 0, 8, 24);
    const elsewhere = mockArrangementClip("913", 0, 40, 42);

    // 911 and 912 both land at 32, so the shorter one is overwritten; 913
    // lands at 64 and is a group of its own.
    expect(
      computeNonSurvivorClipIds(
        [short, long, elsewhere],
        moves(null, {
          startBeatsById: new Map([
            ["911", 32],
            ["912", 32],
            ["913", 64],
          ]),
        }),
      ),
    ).toStrictEqual(new Set(["911"]));
  });

  it("skips a clip with no position of its own", () => {
    const short = mockArrangementClip("921", 0, 0, 4);
    const long = mockArrangementClip("922", 0, 8, 24);

    // 921 stays where it is, so nothing in the call says the two collide.
    expect(
      computeNonSurvivorClipIds(
        [short, long],
        moves(null, { startBeatsById: new Map([["922", 32]]) }),
      ),
    ).toBeNull();
  });

  it("skips a clip whose own arrangementLength is set", () => {
    const short = mockArrangementClip("931", 0, 0, 4);
    const tiled = mockArrangementClip("932", 0, 8, 24);

    // 932 tiles to fill its span, which the length comparison doesn't model,
    // so it can't stand in for the clip below it.
    expect(
      computeNonSurvivorClipIds([short, tiled], {
        startBeatsFor: () => 32,
        lengthBeatsFor: (clip) => (clip.id === "932" ? 16 : null),
      }),
    ).toBeNull();
  });
});
