// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import * as arrangementWorkaround from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import {
  handleArrangementOperations,
  handleArrangementStartOperation,
} from "../../helpers/arrangement/update-clip-arrangement-helpers.ts";
import { type OverwritePlan } from "../../helpers/arrangement/update-clip-arrangement-optimizer.ts";
import { flushDeferredDeletions } from "../../helpers/arrangement/update-clip-deferred-deletion.ts";
import {
  moveGroupKey,
  type MoveGroup,
} from "../../helpers/arrangement/update-clip-move-groups.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/**
 * How many clips the tally counted on one lane at one position.
 * @param groups - The tally
 * @param trackIndex - The lane's track
 * @param startBeats - The position
 * @returns The count, or undefined when nothing landed there
 */
function groupCount(
  groups: Map<string, MoveGroup>,
  trackIndex: number,
  startBeats: number,
): number | undefined {
  return groups.get(moveGroupKey(trackIndex, startBeats))?.count;
}

const mockContext = { silenceWavPath: "/tmp/test-silence.wav" } as const;

/**
 * A clip stub answering the one property handleArrangementStartOperation reads.
 * @param id - The clip id it reports
 * @param isArrangementClip - 1 for an arrangement clip, 0 for a session clip
 * @param trackIndex - Owning track index, or null when it can't be determined
 * @returns A clip stub for the `clip` argument
 */
function clipStub(
  id: string,
  isArrangementClip: number,
  trackIndex: number | null = null,
): LiveAPI {
  return {
    id,
    getProperty: vi.fn((prop) =>
      prop === "is_arrangement_clip" ? isArrangementClip : null,
    ),
    exists: () => true,
    trackIndex,
  } as unknown as LiveAPI;
}

/**
 * Run handleArrangementStartOperation with the fixed context every case shares.
 * @param clip - The clip stub under test
 * @param arrangementStartBeats - Requested arrangement start
 * @param movedClipGroups - Move tally, for cases that assert on it
 * @param destination - Where the clip moves, or null for its own lane
 * @returns The clip id the operation resolved to
 */
function runStartOperation(
  clip: LiveAPI,
  arrangementStartBeats: number | null,
  movedClipGroups = new Map<string, MoveGroup>(),
  destination: ArrangementTrack | null = null,
) {
  return handleArrangementStartOperation({
    clip,
    arrangementStartBeats,
    destination,
    movedClipGroups,
    appendedLanes: new Map(),
    isMidiClip: true,
    context: mockContext,
    updatedClips: [],
    noteResult: null,
  });
}

describe("update-clip-arrangement-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleArrangementStartOperation", () => {
    it("should warn and return original ID for session clips", () => {
      const result = runStartOperation(clipStub("123", 0), 16);

      expect(capturedWarnings()).toContain(
        "arrangementStart parameter ignored for session clip id 123",
      );
      expect(result).toBe("123");
    });

    it("should warn and return original clip id when trackIndex is null for arrangement clips", () => {
      // Should not throw, just warn and return original clip id
      const result = runStartOperation(clipStub("456", 1, null), 16);

      expect(capturedWarnings()).toContain(
        "could not determine trackIndex for clip id 456",
      );
      expect(result).toBe("456");
    });

    it("should duplicate clip to new position and delete original", () => {
      const trackIndex = 2;
      const newClipId = "999";

      // Register track mock with duplication method
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        methods: {
          duplicate_clip_to_arrangement: () => ["id", 999],
        },
      });

      // Register new clip that will be created by duplication
      registerMockObject(newClipId, {
        path: livePath.track(trackIndex).arrangementClip(0),
      });

      const movedClipGroups = new Map<string, MoveGroup>();
      // LiveAPI.id returns just the number
      const result = runStartOperation(
        clipStub("789", 1, trackIndex),
        32,
        movedClipGroups,
      );

      // Code now formats ID with "id " prefix for Live API calls
      expect(trackMock.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 789",
        32,
      );
      expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 789");
      expect(result).toBe(newClipId);
      expect(groupCount(movedClipGroups, trackIndex, 32)).toBe(1);
    });

    it("routes a self-overlapping move through the holding area and deletes the original", () => {
      const trackIndex = 3;
      let dupCount = 0;

      // The real workaround runs here (this file does not mock it). The source
      // [0,16] moved to beat 4 overlaps its own target [4,20]:
      // clearClipAtDuplicateTarget returns false, so the move routes through the
      // holding area — copy to holding, trim/overwrite the original, place a full
      // copy — then deletes the original, leaving one full-length clip at the new
      // position.
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        properties: { arrangement_clips: ["id", "700"] },
        methods: {
          duplicate_clip_to_arrangement: () => {
            dupCount++;

            return dupCount === 1 ? ["id", "710"] : ["id", "720"];
          },
          create_midi_clip: () => ["id", "730"],
          delete_clip: () => null,
        },
      });

      // Source clip, resolved when the workaround iterates arrangement clips.
      registerMockObject("700", {
        path: livePath.track(trackIndex).arrangementClip(0),
        properties: { is_arrangement_clip: 1, start_time: 0, end_time: 16 },
      });
      // Holding copy the first duplicate creates. The holding area clears the
      // target placement (4 + 16 = 20) as well as maxEnd 16: max(16, 20) + 100.
      registerMockObject("710", {
        path: livePath.track(trackIndex).arrangementClip(1),
        properties: { is_arrangement_clip: 1, start_time: 120, end_time: 136 },
      });
      // The full copy placed at the target.
      registerMockObject("720", {
        path: livePath.track(trackIndex).arrangementClip(2),
      });

      const mockClip = {
        id: "700",
        path: `live_set tracks ${trackIndex} arrangement_clips 0`,
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") return 1;
          if (prop === "start_time") return 0;
          if (prop === "end_time") return 16;

          return null;
        }),
        trackIndex,
        exists: () => true,
      };

      const movedClipGroups = new Map<string, MoveGroup>();

      const result = handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 4,
        destination: null,
        movedClipGroups,
        appendedLanes: new Map(),
        isMidiClip: true,
        context: mockContext,
        updatedClips: [],
        noteResult: null,
      });

      // Holding round-trip: copy source to holding (120), place full copy at 4.
      expect(trackMock.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 700",
        120,
      );
      expect(trackMock.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 710",
        4,
      );
      // Both the holding clip and the original are removed → one clip at target.
      expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 710");
      expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 700");
      expect(result).toBe("720");
    });

    it("should warn and return original ID when duplication fails", () => {
      const trackIndex = 0;

      // Register track mock that returns non-existent "id 0" result
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        methods: {
          duplicate_clip_to_arrangement: () => ["id", 0],
        },
      });

      const mockClip = {
        id: "100",
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") return 1;

          return null;
        }),
        trackIndex: 0,
      };

      const movedClipGroups = new Map<string, MoveGroup>();

      const result = handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 8,
        destination: null,
        movedClipGroups,
        appendedLanes: new Map(),
        isMidiClip: true,
        context: mockContext,
        updatedClips: [],
        noteResult: null,
      });

      // Should warn about failure and return original clip ID
      expect(capturedWarnings()).toContain(
        "failed to duplicate clip id 100 - original preserved",
      );
      expect(result).toBe("100");
      // Should NOT call delete_clip since duplication failed
      expect(trackMock.call).not.toHaveBeenCalledWith(
        "delete_clip",
        expect.anything(),
      );
    });

    it("should increment move count for multiple moves on same track", () => {
      const trackIndex = 1;
      const newClipId = "888";

      // Register track mock
      registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        methods: {
          duplicate_clip_to_arrangement: () => ["id", 888],
        },
      });

      // Register new clip mock
      registerMockObject(newClipId, {
        path: livePath.track(trackIndex).arrangementClip(0),
      });

      const mockClip = {
        id: "555", // LiveAPI.id returns just the number
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") {
            return 1;
          }

          return null;
        }),
        exists: () => true,
        trackIndex,
      };

      // Simulate previous moves onto the same lane at the same position
      const movedClipGroups = new Map<string, MoveGroup>([
        [
          moveGroupKey(trackIndex, 64),
          { trackIndex, count: 2, landed: new Set<string>(), deferred: [] },
        ],
      ]);

      handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 64,
        destination: null,
        movedClipGroups,
        appendedLanes: new Map(),
        isMidiClip: true,
        context: mockContext,
        updatedClips: [],
        noteResult: null,
      });

      expect(groupCount(movedClipGroups, trackIndex, 64)).toBe(3);
    });

    // Nothing about the clip is touched here: only a confirmed landing, later
    // in the call, decides whether it is cleared at all.
    it("holds a non-survivor back rather than clearing it", () => {
      const { trackMock, result, movedClipGroups, updatedClips } =
        callWithNonSurvivorClip();

      expect(result).toBeNull();
      expect(trackMock.call).not.toHaveBeenCalledWith(
        "delete_clip",
        expect.anything(),
      );
      expect(trackMock.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.anything(),
        expect.anything(),
      );
      // Not counted either: nothing has landed on it yet.
      expect(groupCount(movedClipGroups, 0, 16)).toBe(0);
      expect(movedClipGroups.get(moveGroupKey(0, 16))?.deferred).toHaveLength(
        1,
      );
      // The clip still gets its place in the response, in call order.
      expect(updatedClips).toStrictEqual([{ id: "200" }]);
    });

    it("does not re-delete the original when the move was unsafe and the clip is already gone", () => {
      const trackIndex = 0;
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
      });

      // Unsafe move (self-overlap): the holding round-trip already trimmed/replaced
      // the original, so clip.exists() is false and delete must be skipped.
      const clearSpy = vi
        .spyOn(arrangementWorkaround, "clearClipAtDuplicateTarget")
        .mockReturnValue(false);
      const dupSpy = vi
        .spyOn(arrangementWorkaround, "duplicateSelfOverlappingClip")
        .mockReturnValue({
          id: "new999",
          exists: () => true,
        } as unknown as LiveAPI);

      const mockClip = {
        id: "888",
        getProperty: vi.fn((prop) =>
          prop === "is_arrangement_clip" ? 1 : null,
        ),
        trackIndex,
        exists: () => false,
      };

      const result = handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 16,
        destination: null,
        movedClipGroups: new Map(),
        appendedLanes: new Map(),
        isMidiClip: true,
        context: mockContext,
        updatedClips: [],
        noteResult: null,
      });

      // safeToMove(false) || clip.exists()(false) === false → no delete.
      expect(trackMock.call).not.toHaveBeenCalledWith(
        "delete_clip",
        expect.anything(),
      );
      expect(result).toBe("new999");

      clearSpy.mockRestore();
      dupSpy.mockRestore();
    });
  });

  describe("handleArrangementOperations", () => {
    it("passes isMidiClip as the negation of isAudioClip into the move operation", () => {
      const trackIndex = 0;

      registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        methods: {
          duplicate_clip_to_arrangement: () => ["id", 999],
        },
      });
      registerMockObject("999", {
        path: livePath.track(trackIndex).arrangementClip(0),
      });

      const clearSpy = vi
        .spyOn(arrangementWorkaround, "clearClipAtDuplicateTarget")
        .mockReturnValue(true);

      const mockClip = {
        id: "789",
        getProperty: vi.fn((prop) =>
          prop === "is_arrangement_clip" ? 1 : null,
        ),
        exists: () => true,
        trackIndex,
      };

      const updatedClips: { id: string }[] = [];

      handleArrangementOperations({
        clip: mockClip as unknown as LiveAPI,
        isAudioClip: true,
        arrangementStartBeats: 16,
        arrangementLengthBeats: null,
        movedClipGroups: new Map(),
        appendedLanes: new Map(),
        context: mockContext,
        updatedClips,
        noteResult: null,
      });

      // isAudioClip:true → isMidiClip must be false (4th arg).
      expect(clearSpy).toHaveBeenCalledWith(
        expect.anything(),
        "789",
        16,
        false,
        expect.anything(),
        expect.anything(),
      );

      clearSpy.mockRestore();
    });

    it("returns early without recording a result for a deleted non-survivor", () => {
      const trackIndex = 0;
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
      });

      const mockClip = {
        id: "200",
        getProperty: vi.fn((prop) =>
          prop === "is_arrangement_clip" ? 1 : null,
        ),
        trackIndex,
        exists: () => true,
      };

      const updatedClips: ClipResult[] = [];

      handleArrangementOperations({
        clip: mockClip as unknown as LiveAPI,
        isAudioClip: false,
        arrangementStartBeats: 16,
        arrangementLengthBeats: null,
        movedClipGroups: new Map(),
        appendedLanes: new Map(),
        context: mockContext,
        updatedClips,
        noteResult: null,
        isNonSurvivor: true,
      });

      // The start op recorded the entry itself, so the length branch skips it.
      expect(trackMock.call).not.toHaveBeenCalledWith(
        "delete_clip",
        expect.anything(),
      );
      expect(updatedClips).toStrictEqual([{ id: "200" }]);
    });
  });
});

describe("a clip held back for an overwrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears it once the clip that overwrites it has landed", async () => {
    const track = setupTwoClipsOnOneTrack();

    const result = await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
    });

    expect(result).toStrictEqual([
      { id: FIRST, path: "t0[1|1]", deleted: true },
      { id: MOVED, path: "t0[17|1]" },
    ]);
    expect(deletedIds(track)).toStrictEqual([`id ${SECOND}`, `id ${FIRST}`]);
    expect(capturedWarnings()).toContain(
      "2 clips on t0 moved to the same position - later clips will overwrite earlier ones",
    );
  });

  // The bug this guards: the first clip used to be cleared on the prediction
  // alone, so a refused second move left the caller with one clip destroyed and
  // nothing in the response naming it.
  it("keeps it when Live silently declines the move that would overwrite it", async () => {
    const track = setupTwoClipsOnOneTrack(true);

    const result = await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
    });

    expect(deletedIds(track)).toStrictEqual([]);
    expect(result).toStrictEqual([
      { id: FIRST, path: "t0[1|1]", deleted: false },
      { id: SECOND, path: "t0[5|1]" },
    ]);
    expect(capturedWarnings()).toContain(
      `failed to duplicate clip t0[5|1] (id ${SECOND}) - original preserved`,
    );
    // Nothing landed, so nothing stacked.
    expect(capturedWarnings().join(" ")).not.toContain(
      "moved to the same position",
    );
  });

  it("does not clear it for a landing by a clip outside its group", () => {
    // A tiling clip can land on the same track and position without being one
    // of the clips whose length made this one a non-survivor.
    const { movedClipGroups, result, sourceTrack } =
      groupHoldingOneClipBack("outsider");

    flushDeferredDeletions(movedClipGroups, planBuryingFirst());

    expect(result).toStrictEqual({ id: FIRST, deleted: false });
    expect(sourceTrack.call).not.toHaveBeenCalled();
    expect(movedClipGroups.get(GROUP)?.count).toBe(1);
  });

  it("skips the delete when the landing already cleared it away", () => {
    const { movedClipGroups, result, sourceTrack } = groupHoldingOneClipBack(
      SECOND,
      false,
    );

    flushDeferredDeletions(movedClipGroups, planBuryingFirst());

    expect(result).toStrictEqual({ id: FIRST, deleted: true });
    expect(sourceTrack.call).not.toHaveBeenCalled();
    // Still counted: the clip is gone either way.
    expect(movedClipGroups.get(GROUP)?.count).toBe(2);
  });

  // Survivors descend in length, but a non-survivor can outlast a later, shorter
  // one: lengths [20, 40, 12] leave the 20 a non-survivor while the 12 survives.
  // The 12 landing buries only 12 of its 20 beats, so it settles nothing.
  it("does not clear it for a landing too short to bury it", () => {
    const { movedClipGroups, result, sourceTrack } =
      groupHoldingOneClipBack(SECOND);

    flushDeferredDeletions(movedClipGroups, {
      nonSurvivorIds: new Set([FIRST]),
      survivorLengthsByGroup: new Map([[GROUP, new Map([[SECOND, 12]])]]),
      lengthById: new Map([
        [FIRST, 20],
        [SECOND, 12],
      ]),
    });

    expect(result).toStrictEqual({ id: FIRST, deleted: false });
    expect(sourceTrack.call).not.toHaveBeenCalled();
    expect(movedClipGroups.get(GROUP)?.count).toBe(1);
  });

  it("clears it for a landing exactly as long as it is", () => {
    const { movedClipGroups, result, sourceTrack } =
      groupHoldingOneClipBack(SECOND);

    flushDeferredDeletions(movedClipGroups, {
      nonSurvivorIds: new Set([FIRST]),
      survivorLengthsByGroup: new Map([[GROUP, new Map([[SECOND, 20]])]]),
      lengthById: new Map([
        [FIRST, 20],
        [SECOND, 20],
      ]),
    });

    expect(result).toStrictEqual({ id: FIRST, deleted: true });
    expect(sourceTrack.call).toHaveBeenCalledWith(
      "delete_clip",
      expect.anything(),
    );
  });

  // The failed placement cleared the target range before the copy it never
  // made, and this clip was sitting in it.
  it("reports a held-back clip the failed placement destroyed anyway", () => {
    const { movedClipGroups, result, sourceTrack } = groupHoldingOneClipBack(
      "outsider",
      false,
    );

    flushDeferredDeletions(movedClipGroups, planBuryingFirst());

    expect(result).toStrictEqual({ id: FIRST, deleted: true });
    expect(sourceTrack.call).not.toHaveBeenCalled();
    // Nothing landed, so it stacked with nothing.
    expect(movedClipGroups.get(GROUP)?.count).toBe(1);
  });

  it("clears nothing when the call planned no overwrite at all", () => {
    const { movedClipGroups, result, sourceTrack } =
      groupHoldingOneClipBack(SECOND);

    flushDeferredDeletions(movedClipGroups, undefined);

    expect(result).toStrictEqual({ id: FIRST, deleted: false });
    expect(sourceTrack.call).not.toHaveBeenCalled();
  });
});

/** Same length as SECOND and named first, so it is the one held back. */
const FIRST = "100";
const SECOND = "101";
/** The clip Live hands back when the duplicate really happens. */
const MOVED = "moved-101";
/** 17|1 in beats: clear of both clips, so neither move self-overlaps. */
const TARGET_BEATS = 64;
/** The track and position both clips are headed for. */
const GROUP = moveGroupKey(0, TARGET_BEATS);

/**
 * Two equal-length arrangement clips on one track, both about to be moved to
 * one position — so the first is the clip the optimizer expects the second to
 * land on top of.
 * @param duplicateFails - Answer the duplicate with id 0, as a frozen track does
 * @returns The track mock, which records the deletes and the duplicate
 */
function setupTwoClipsOnOneTrack(duplicateFails = false): RegisteredMockObject {
  registerMockObject("live-set", {
    path: "live_set",
    type: "Song",
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  for (const [index, id] of [FIRST, SECOND].entries()) {
    registerMockObject(id, {
      path: livePath.track(0).arrangementClip(index),
      type: "Clip",
      properties: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: index * 16,
        end_time: index * 16 + 16,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });
  }

  return registerMockObject("held-back-track", {
    path: livePath.track(0),
    type: "Track",
    properties: { track_index: 0 },
    methods: {
      // Live answers a duplicate it silently declined — on a frozen track, say
      // — with an id that resolves to nothing.
      duplicate_clip_to_arrangement: () => {
        if (duplicateFails) return ["id", 0];

        registerMockObject(MOVED, {
          path: livePath.track(0).arrangementClip(2),
          type: "Clip",
          properties: {
            is_arrangement_clip: 1,
            is_midi_clip: 1,
            start_time: TARGET_BEATS,
            end_time: TARGET_BEATS + 16,
            signature_numerator: 4,
            signature_denominator: 4,
          },
        });

        return ["id", MOVED];
      },
      delete_clip: () => null,
    },
  });
}

/**
 * Every clip id the track was told to delete.
 * @param track - The track mock
 * @returns The ids, in call order
 */
function deletedIds(track: RegisteredMockObject): string[] {
  return vi
    .mocked(track.call)
    .mock.calls.filter(([method]) => method === "delete_clip")
    .map((call) => call[1] as string);
}

/**
 * One group holding one clip back, with whatever landed on it.
 * @param landed - The id whose placement landed on this track and position
 * @param clipExists - Whether the held-back clip is still there
 * @returns The tally, the clip's entry, and the track it sits on
 */
/**
 * A plan whose survivor is long enough to bury the held-back clip.
 * @returns The overwrite plan
 */
function planBuryingFirst(): OverwritePlan {
  return {
    nonSurvivorIds: new Set([FIRST]),
    survivorLengthsByGroup: new Map([[GROUP, new Map([[SECOND, 16]])]]),
    lengthById: new Map([
      [FIRST, 8],
      [SECOND, 16],
    ]),
  };
}

function groupHoldingOneClipBack(landed: string, clipExists = true) {
  const sourceTrack = registerMockObject(`flush-track-${landed}`, {
    path: livePath.track(0),
    type: "Track",
    methods: { delete_clip: () => null },
  });
  const result: ClipResult = { id: FIRST };
  const movedClipGroups = new Map<string, MoveGroup>([
    [
      GROUP,
      {
        trackIndex: 0,
        count: 1,
        landed: new Set([landed]),
        deferred: [
          {
            clip: {
              id: FIRST,
              path: "",
              exists: () => clipExists,
            } as unknown as LiveAPI,
            sourceTrack: sourceTrack as unknown as LiveAPI,
            result,
          },
        ],
      },
    ],
  ]);

  return { movedClipGroups, result, sourceTrack };
}

/**
 * Sets up a non-survivor clip scenario and calls handleArrangementStartOperation.
 * @returns The result of handleArrangementStartOperation
 */
function callWithNonSurvivorClip() {
  const trackIndex = 0;

  const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: `live_set tracks ${trackIndex}`,
  });

  const { result, movedClipGroups, updatedClips } = callArrangementStart({
    clipId: "200",
    trackIndex,
    isNonSurvivor: true,
    exists: () => true,
  });

  return { trackMock, result, movedClipGroups, updatedClips };
}

interface CallArrangementStartOptions {
  clipId: string;
  trackIndex: number;
  path?: string;
  exists?: () => boolean;
  isNonSurvivor?: boolean;
}

/**
 * Build a mock arrangement clip and invoke handleArrangementStartOperation.
 * Shared between the non-survivor and take-lane scenarios.
 *
 * @param opts - Options describing the mock clip and call shape
 * @returns The result and the shared move tally
 */
function callArrangementStart(opts: CallArrangementStartOptions): {
  result: string | null;
  movedClipGroups: Map<string, MoveGroup>;
  updatedClips: ClipResult[];
} {
  const mockClip: Record<string, unknown> = {
    id: opts.clipId,
    getProperty: vi.fn((prop) => {
      if (prop === "is_arrangement_clip") return 1;

      return null;
    }),
    trackIndex: opts.trackIndex,
  };

  if (opts.path != null) mockClip.path = opts.path;
  if (opts.exists != null) mockClip.exists = opts.exists;

  const movedClipGroups = new Map<string, MoveGroup>();
  const updatedClips: ClipResult[] = [];

  const result = handleArrangementStartOperation({
    clip: mockClip as unknown as LiveAPI,
    arrangementStartBeats: 16,
    destination: null,
    movedClipGroups,
    appendedLanes: new Map(),
    isMidiClip: true,
    context: mockContext,
    updatedClips,
    noteResult: null,
    isNonSurvivor: opts.isNonSurvivor,
  });

  return { result, movedClipGroups, updatedClips };
}
