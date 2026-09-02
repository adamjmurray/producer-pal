// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { type ClipPath } from "#src/tools/shared/validation/object-path-helpers.ts";
import { handleArrangementOperations } from "../../helpers/arrangement/update-clip-arrangement-helpers.ts";
import {
  handlePositionOperations,
  resolveMoveDestinations,
} from "../../helpers/update-clip-session-helpers.ts";
import { handleClipSlotMove } from "../../helpers/update-clip-slot-move-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

vi.mock(
  import("../../helpers/arrangement/update-clip-arrangement-helpers.ts"),
  () => ({
    handleArrangementOperations: vi.fn(),
  }),
);

/** Id of the clip Live creates in the destination slot when the copy lands */
const COPY_ID = "456";
/** Id of the clip already sitting in the destination slot */
const OCCUPANT_ID = "789";

/**
 * Create a mock clip and register destination slot mocks, then call handleClipSlotMove.
 * Unregistered objects are non-existent here, so a slot only holds a clip when
 * this helper puts one there — the destination's clip appears when (and only
 * when) duplicate_clip_to actually copies.
 * @param opts - Test options
 * @param opts.trackIndex - Source clip track index
 * @param opts.sceneIndex - Source clip scene index
 * @param opts.toTrackIndex - Destination track index
 * @param opts.toSceneIndex - Destination scene index
 * @param opts.destHasClip - Whether destination slot already has a clip
 * @param opts.noteResult - Note result to pass
 * @param opts.copyLands - Whether duplicate_clip_to makes the copy
 * @param opts.clipIsMidi - Whether the source clip is MIDI
 * @param opts.destIsMidi - Whether the destination track takes MIDI
 * @param opts.destIsFrozen - Whether the destination track is frozen
 * @returns Object with mockClip, updatedClips, and source clip slot mock
 */
function runSessionMove(opts: {
  trackIndex?: number;
  sceneIndex?: number;
  toTrackIndex: number;
  toSceneIndex: number;
  destHasClip?: number;
  noteResult?: { noteCount: number } | null;
  copyLands?: boolean;
  clipIsMidi?: number;
  destIsMidi?: number;
  destIsFrozen?: number;
}) {
  const {
    trackIndex = 0,
    sceneIndex = 0,
    toTrackIndex,
    toSceneIndex,
    destHasClip = 0,
    noteResult = null,
    copyLands = true,
    clipIsMidi = 1,
    destIsMidi = 1,
    destIsFrozen = 0,
  } = opts;

  mockNonExistentObjects();

  const mockClip = {
    id: "123",
    trackIndex,
    sceneIndex,
    path: livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
    getProperty: vi.fn((prop: string) =>
      prop === "is_midi_clip" ? clipIsMidi : undefined,
    ),
  };

  registerMockObject(`live_set/tracks/${toTrackIndex}`, {
    path: livePath.track(toTrackIndex),
    properties: { has_midi_input: destIsMidi, is_frozen: destIsFrozen },
  });

  const destClipPath = livePath
    .track(toTrackIndex)
    .clipSlot(toSceneIndex)
    .clip();

  const sourceSlot = registerMockObject(
    `live_set/tracks/${trackIndex}/clip_slots/${sceneIndex}`,
    {
      path: livePath.track(trackIndex).clipSlot(sceneIndex),
      methods: {
        duplicate_clip_to: () => {
          if (copyLands) registerMockObject(COPY_ID, { path: destClipPath });

          return null;
        },
      },
    },
  );

  registerMockObject(
    `live_set/tracks/${toTrackIndex}/clip_slots/${toSceneIndex}`,
    {
      path: livePath.track(toTrackIndex).clipSlot(toSceneIndex),
      properties: { has_clip: destHasClip },
    },
  );

  if (destHasClip) {
    registerMockObject(OCCUPANT_ID, { path: destClipPath });
  }

  const updatedClips: ClipResult[] = [];

  handleClipSlotMove({
    clip: mockClip as unknown as LiveAPI,
    toSlot: { trackIndex: toTrackIndex, sceneIndex: toSceneIndex },
    updatedClips,
    noteResult,
  });

  return {
    mockClip,
    updatedClips,
    sourceSlot: sourceSlot as RegisteredMockObject,
  };
}

describe("handleClipSlotMove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should move session clip to new slot", () => {
    const { updatedClips, sourceSlot } = runSessionMove({
      toTrackIndex: 1,
      toSceneIndex: 2,
      noteResult: { noteCount: 5 },
    });

    expect(sourceSlot.call).toHaveBeenCalledWith(
      "duplicate_clip_to",
      "id live_set/tracks/1/clip_slots/2",
    );
    expect(sourceSlot.call).toHaveBeenCalledWith("delete_clip");
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toStrictEqual({
      id: COPY_ID,
      noteCount: 5,
      path: "t1/s2",
    });
  });

  it("should warn and skip for clip with unknown slot position", () => {
    const mockClip = {
      id: "123",
      trackIndex: null,
      sceneIndex: null,
      getProperty: vi.fn(),
    };

    const updatedClips: ClipResult[] = [];

    handleClipSlotMove({
      clip: mockClip as unknown as LiveAPI,
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      updatedClips,
      noteResult: null,
    });

    expect(capturedWarnings()).toContain(
      "could not determine slot position for clip 123",
    );
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toStrictEqual({ id: "123" });
  });

  /**
   * Move a clip whose source slot is only half-known, and assert the guard
   * warned rather than computing a bogus source slot.
   * @param trackIndex - Source track index, or null when unknown
   * @param sceneIndex - Source scene index, or null when unknown
   */
  function expectUnknownSlotWarning(
    trackIndex: number | null,
    sceneIndex: number | null,
  ): void {
    handleClipSlotMove({
      clip: {
        id: "123",
        trackIndex,
        sceneIndex,
        getProperty: vi.fn(),
      } as unknown as LiveAPI,
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      updatedClips: [],
      noteResult: null,
    });

    expect(capturedWarnings()).toContain(
      "could not determine slot position for clip 123",
    );
  }

  it("should warn when only the track index is unknown", () => {
    // sceneIndex is a real number: the guard must still fire (|| not &&, and the
    // whole conditional must not be forced false).
    expectUnknownSlotWarning(null, 0);
  });

  it("should warn when only the scene index is unknown", () => {
    // trackIndex is a real number, sceneIndex is null: the second operand of the
    // guard must stay live (kills the srcSceneIndex == null -> false mutant).
    expectUnknownSlotWarning(0, null);
  });

  it("should move (not no-op) when only the scene index matches", () => {
    const { updatedClips, sourceSlot } = runSessionMove({
      trackIndex: 0,
      sceneIndex: 1,
      toTrackIndex: 2,
      toSceneIndex: 1,
    });

    // Same-scene but different track is NOT the same slot: the trackIndex ===
    // comparison must stay live (forced-true would treat it as a no-op).
    expect(sourceSlot.call).toHaveBeenCalledWith(
      "duplicate_clip_to",
      expect.any(String),
    );
    expect(updatedClips[0]).toStrictEqual({
      id: COPY_ID,
      path: "t2/s1",
    });
  });

  it("should not warn about overwriting when the destination is empty", () => {
    runSessionMove({ toTrackIndex: 1, toSceneIndex: 5, destHasClip: 0 });

    // has_clip is falsy, so the overwrite warning must not fire (kills the
    // forced-true mutant on the has_clip guard).
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("overwrote the existing clip"),
    );
  });

  it("should no-op when moving to same slot", () => {
    const { updatedClips } = runSessionMove({
      trackIndex: 2,
      sceneIndex: 3,
      toTrackIndex: 2,
      toSceneIndex: 3,
    });

    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toStrictEqual({
      id: "123",
      path: "t2/s3",
    });
    // No duplicate_clip_to should have been called
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("overwriting"),
    );
  });

  it("should warn when destination slot does not exist", () => {
    mockNonExistentObjects();

    const mockClip = {
      id: "123",
      trackIndex: 0,
      sceneIndex: 0,
      getProperty: vi.fn(),
    };

    const updatedClips: ClipResult[] = [];

    handleClipSlotMove({
      clip: mockClip as unknown as LiveAPI,
      toSlot: { trackIndex: 99, sceneIndex: 99 },
      updatedClips,
      noteResult: null,
    });

    expect(capturedWarnings()).toContain(
      "clip 123 was not moved: destination t99/s99 does not exist",
    );
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toStrictEqual({ id: "123" });
  });

  // duplicate_clip_to no-ops on a type mismatch and the source is deleted right
  // after, so without this guard the clip is destroyed and reported as moved.
  it("should not move (or delete) a MIDI clip to an audio track", () => {
    const { updatedClips, sourceSlot } = runSessionMove({
      toTrackIndex: 1,
      toSceneIndex: 2,
      destIsMidi: 0,
    });

    expect(capturedWarnings()).toContain(
      "MIDI clip 123 was not moved: track 1 is audio",
    );
    expect(sourceSlot.call).not.toHaveBeenCalled();
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toStrictEqual({ path: "t0/s0", id: "123" });
    expect(updatedClips[0]).not.toHaveProperty("slot");
  });

  // A frozen track still reports has_midi_input, so the type check passes and
  // Live refuses the copy anyway. Naming the reason beats the generic
  // "no clip landed" backstop below.
  it("should not move (or delete) a clip to a frozen track", () => {
    const { updatedClips, sourceSlot } = runSessionMove({
      toTrackIndex: 17,
      toSceneIndex: 0,
      destHasClip: 1,
      destIsFrozen: 1,
      copyLands: false,
    });

    expect(capturedWarnings()).toContain(
      "MIDI clip 123 was not moved: track 17 is frozen",
    );
    expect(sourceSlot.call).not.toHaveBeenCalled();
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toStrictEqual({ path: "t0/s0", id: "123" });
    expect(updatedClips[0]).not.toHaveProperty("slot");
  });

  it("should move a clip to an unfrozen track", () => {
    const { updatedClips } = runSessionMove({
      toTrackIndex: 1,
      toSceneIndex: 2,
      destIsFrozen: 0,
    });

    // is_frozen is falsy, so the frozen guard must not fire (kills its
    // forced-true mutant).
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("is frozen"),
    );
    expect(updatedClips[0]).toStrictEqual({ id: COPY_ID, path: "t1/s2" });
  });

  it("should not move an audio clip to a MIDI track", () => {
    const { updatedClips, sourceSlot } = runSessionMove({
      toTrackIndex: 1,
      toSceneIndex: 2,
      clipIsMidi: 0,
    });

    expect(capturedWarnings()).toContain(
      "audio clip 123 was not moved: track 1 is MIDI",
    );
    expect(sourceSlot.call).not.toHaveBeenCalled();
    expect(updatedClips).toHaveLength(1);
  });

  // duplicate_clip_to reports nothing when it declines the copy, so the delete
  // has to be gated on the copy actually being there — for any reason it
  // declined, not just the MIDI/audio mismatch above.
  it("should keep the source when no clip lands in an empty destination", () => {
    const { updatedClips, sourceSlot } = runSessionMove({
      toTrackIndex: 1,
      toSceneIndex: 2,
      copyLands: false,
    });

    expect(sourceSlot.call).toHaveBeenCalledWith(
      "duplicate_clip_to",
      expect.any(String),
    );
    expect(sourceSlot.call).not.toHaveBeenCalledWith("delete_clip");
    expect(capturedWarnings()).toContain(
      "clip 123 was not moved: no clip landed at t1/s2, so the original was kept",
    );
    expect(updatedClips[0]).toStrictEqual({ path: "t0/s0", id: "123" });
  });

  // The dangerous case: the slot already holds a clip, so a path lookup finds
  // one either way. Only the destination clip's id tells the copy apart from
  // the clip that was always there — get it wrong and the source is deleted.
  it("should keep the source when the occupied destination still holds its own clip", () => {
    const { updatedClips, sourceSlot } = runSessionMove({
      toTrackIndex: 1,
      toSceneIndex: 2,
      destHasClip: 1,
      copyLands: false,
    });

    expect(sourceSlot.call).not.toHaveBeenCalledWith("delete_clip");
    expect(capturedWarnings()).toContain(
      "clip 123 was not moved: no clip landed at t1/s2, so the original was kept",
    );
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toStrictEqual({ path: "t0/s0", id: "123" });
    // Reporting the clip that was already there as the moved clip is its own
    // defect, on top of deleting the source.
    expect(updatedClips[0]?.id).not.toBe(OCCUPANT_ID);
    expect(updatedClips[0]).not.toHaveProperty("slot");
  });

  // The old warning fired before the copy, so a declined copy produced two
  // contradictory warnings and the first one was false.
  it("should not claim an overwrite when the copy never landed", () => {
    runSessionMove({
      toTrackIndex: 0,
      toSceneIndex: 1,
      destHasClip: 1,
      copyLands: false,
    });

    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("overwrote the existing clip"),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("so the original was kept"),
    );
  });

  it("should warn when overwriting existing clip at destination", () => {
    const { updatedClips, sourceSlot } = runSessionMove({
      toTrackIndex: 0,
      toSceneIndex: 1,
      destHasClip: 1,
    });

    expect(capturedWarnings()).toContain(
      "clip 123 overwrote the existing clip at t0/s1",
    );
    expect(sourceSlot.call).toHaveBeenCalledWith("delete_clip");
    expect(updatedClips).toHaveLength(1);
    // The copy replaced the occupant, so the result is the copy's id.
    expect(updatedClips[0]).toStrictEqual({
      id: COPY_ID,
      path: "t0/s1",
    });
  });

  it("should include noteCount in result when provided", () => {
    const { updatedClips } = runSessionMove({
      toTrackIndex: 0,
      toSceneIndex: 1,
      noteResult: { noteCount: 12 },
    });

    expect(updatedClips[0]).toStrictEqual({
      id: "456",
      noteCount: 12,
      path: "t0/s1",
    });
  });

  it("should omit noteCount from result when null", () => {
    const { updatedClips } = runSessionMove({
      toTrackIndex: 0,
      toSceneIndex: 1,
    });

    expect(updatedClips[0]).not.toHaveProperty("noteCount");
  });
});

interface PositionOpsOptions {
  isArrangementClip?: boolean;
  destinationParam?: "toPath" | "toSlot";
  toSlot?: { trackIndex: number; sceneIndex: number };
  /** An arrangement-lane destination, instead of a slot */
  toLane?: ClipPath;
  arrangementStartBeats?: number;
  arrangementLengthBeats?: number;
}

/**
 * Run handlePositionOperations against a bare clip stub, so each test says only
 * what it varies.
 * @param opts - What this test varies
 */
function runPositionOps(opts: PositionOpsOptions = {}): void {
  const {
    isArrangementClip = false,
    destinationParam = "toPath",
    toSlot,
    toLane,
    arrangementStartBeats,
    arrangementLengthBeats,
  } = opts;

  handlePositionOperations({
    clip: {
      id: "789",
      path: "",
      getProperty: vi.fn((prop: string) =>
        prop === "is_arrangement_clip" && isArrangementClip ? 1 : 0,
      ),
    } as unknown as LiveAPI,
    isAudioClip: false,
    destinationParam,
    destination:
      toSlot == null ? (toLane ?? null) : { kind: "slot", ...toSlot },
    arrangementStartBeats,
    arrangementLengthBeats,
    movedClipGroups: new Map(),
    context: {},
    updatedClips: [],
    noteResult: null,
    isNonSurvivor: false,
  });
}

describe("handlePositionOperations", () => {
  // An arrangement clip with a destination is re-created in the slot, not
  // refused, so it must not reach the arrangement operations at all.
  it("sends an arrangement clip with a destination to the slot move", () => {
    runPositionOps({
      isArrangementClip: true,
      toSlot: { trackIndex: 1, sceneIndex: 2 },
    });

    expect(handleArrangementOperations).not.toHaveBeenCalled();
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("only session clips move to a slot"),
    );
  });

  // toSlot is deprecated and hidden, so a caller who sent toPath must not be
  // pointed at it — and one who sent toSlot is told the name they used.
  it("names the deprecated param when that is what the caller sent", () => {
    runPositionOps({
      destinationParam: "toSlot",
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      arrangementStartBeats: 8,
    });

    expect(capturedWarnings()).toContain(
      "toSlot ignored when arrangement parameters are specified",
    );
  });

  it("should warn when toSlot used with arrangement parameters", () => {
    runPositionOps({
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      arrangementStartBeats: 8,
    });

    expect(capturedWarnings()).toContain(
      "toPath ignored when arrangement parameters are specified",
    );
  });

  it("should warn when toSlot used with arrangement LENGTH only", () => {
    // Only arrangementLengthBeats is set (no start): the second operand of the
    // arrangement-params guard must stay live (kills its -> false mutant).
    runPositionOps({
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      arrangementLengthBeats: 8,
    });

    expect(capturedWarnings()).toContain(
      "toPath ignored when arrangement parameters are specified",
    );
  });

  // A session clip has no arrangement source to duplicate from, so a lane
  // destination can't move it — and it must not be misread as a slot either.
  it("refuses to send a session clip to an arrangement lane", () => {
    runPositionOps({ toLane: { kind: "track", trackIndex: 4 } });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        'toPath "t4" names an arrangement lane, so session clip 789 was not moved',
      ),
    );
    expect(handleArrangementOperations).toHaveBeenCalledWith(
      expect.objectContaining({ destination: null }),
    );
  });

  it("passes an arrangement clip's lane destination to the arrangement operations", () => {
    runPositionOps({
      isArrangementClip: true,
      toLane: { kind: "new-take-lane", trackIndex: 4 },
    });

    expect(handleArrangementOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: { trackIndex: 4, takeLane: "new" },
      }),
    );
  });

  // A lane destination says where on the timeline to land, so unlike a slot it
  // combines with arrangementStart instead of cancelling it.
  it("keeps arrangementStart alongside a lane destination", () => {
    runPositionOps({
      isArrangementClip: true,
      toLane: { kind: "track", trackIndex: 4 },
      arrangementStartBeats: 8,
    });

    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("ignored when arrangement parameters"),
    );
    expect(handleArrangementOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        arrangementStartBeats: 8,
        destination: { trackIndex: 4, takeLane: null },
      }),
    );
  });

  it("runs the arrangement operations when no destination is given", () => {
    // Arrangement clip but no toSlot: the destination branch must stay false
    // (kills its forced-true mutant).
    runPositionOps({ isArrangementClip: true, arrangementStartBeats: 8 });

    expect(handleArrangementOperations).toHaveBeenCalled();
  });
});

describe("resolveMoveDestinations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads a slot from toPath", () => {
    expect(resolveMoveDestinations("t2/s3", undefined, 1)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
    ]);
  });

  it("reads an arrangement lane from toPath", () => {
    expect(
      resolveMoveDestinations("t2,t4/l0,t6/l+", undefined, 3),
    ).toStrictEqual([
      { kind: "track", trackIndex: 2 },
      { kind: "take-lane", trackIndex: 4, laneIndex: 0 },
      { kind: "new-take-lane", trackIndex: 6 },
    ]);
  });

  it("still reads the deprecated toSlot", () => {
    expect(resolveMoveDestinations(undefined, "2/3", 1)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
    ]);
  });

  it("returns nothing when neither param is given", () => {
    expect(resolveMoveDestinations(undefined, undefined, 2)).toStrictEqual([
      null,
      null,
    ]);
    expect(resolveMoveDestinations("  ", undefined, 1)).toStrictEqual([null]);
    expect(resolveMoveDestinations(undefined, "  ", 1)).toStrictEqual([null]);
  });

  it("moves nowhere when toPath and toSlot both name a destination", () => {
    // An update tool warns and skips instead of throwing, but it must not pick
    // one destination over the other.
    expect(resolveMoveDestinations("t2/s3", "4/5", 1)).toStrictEqual([null]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("both name a destination, so no clip was moved"),
    );
  });

  // The worst version of the pairing bug: a toSlot of "," named no second
  // destination, so the check refused a move the caller had asked for once —
  // and the result said nothing about the clip staying put.
  it("moves to toPath when toSlot names nothing", () => {
    expect(resolveMoveDestinations("t2/s3", ",", 1)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining('toSlot "," names nothing'),
    );
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("no clip was moved"),
    );
  });

  it("warns and skips a destination no clip can occupy", () => {
    // A scene names no track, so there is no one place the clip would go.
    expect(resolveMoveDestinations("s3", undefined, 1)).toStrictEqual([null]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("a scene alone names no track"),
    );
  });

  // The whole point of the fan-out: sending both clips to destinations[0] put
  // them in one slot, and the second copy overwrote the first.
  it("pairs each destination with the clip at the same position", () => {
    expect(resolveMoveDestinations("t2/s3,t4/s5", undefined, 2)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
      { kind: "slot", trackIndex: 4, sceneIndex: 5 },
    ]);
  });

  // A single name or color covers every clip; a single destination can't — the
  // second clip sent to a slot overwrites the first.
  it("does not spread a short destination list, and says which clips stayed", () => {
    expect(resolveMoveDestinations("t2/s3", undefined, 3)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
      null,
      null,
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("1 destination for 3 clips"),
    );
  });

  it("warns about destinations with no clip to move", () => {
    expect(resolveMoveDestinations("t2/s3,t4/s5", undefined, 1)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("the extra destinations went unused"),
    );
  });

  it("skips only the entries no clip can occupy", () => {
    expect(
      resolveMoveDestinations("t2/s3,s4,t6/s7", undefined, 3),
    ).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
      null,
      { kind: "slot", trackIndex: 6, sceneIndex: 7 },
    ]);
  });

  it("skips only the entry that won't parse", () => {
    // Regression: the whole list was parsed at once and one throw discarded all
    // of it, so a typo cost every move — while an entry that parsed but named
    // the wrong kind of place cost only its own. Which one you got depended on
    // nothing but which side of the grammar the typo fell on.
    expect(
      resolveMoveDestinations("t2/s3,tX,t6/s7", undefined, 3),
    ).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
      null,
      { kind: "slot", trackIndex: 6, sceneIndex: 7 },
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("clip not moved:"),
    );
  });

  it("moves no clip when toPath names nothing at all", () => {
    // Not the same as one bad entry: "," says a destination was meant and
    // failed to arrive, and moving a clip anywhere else is the wrong guess.
    expect(resolveMoveDestinations(",", undefined, 2)).toStrictEqual([
      null,
      null,
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("it names nothing"),
    );
  });
});
