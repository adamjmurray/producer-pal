// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import * as arrangementWorkaround from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  handleArrangementOperations,
  handleArrangementStartOperation,
} from "../../helpers/arrangement/arrangement-move.ts";
import {
  moveGroupKey,
  type MoveGroup,
} from "../../helpers/arrangement/update-clip-move-groups.ts";
import {
  type ClipReasons,
  newClipReasons,
} from "../../helpers/entries/clip-reasons.ts";
import { joinedClipReason } from "../../helpers/update-clip-test-helpers.ts";
import {
  registerStackingTrack,
  stackedLaneClips,
  stackedLaneSpans,
} from "../batch/stacking-track-test-helpers.ts";

/** What the clips had to say about the last operation run here. */
let reasons: ClipReasons = newClipReasons();
const clipReason = (clipId: string): string =>
  joinedClipReason(reasons, clipId);

/**
 * How many copies are confirmed landed on one lane at one position.
 * @param groups - The tally
 * @param trackIndex - The lane's track
 * @param startBeats - The position
 * @returns The number of landings, or undefined when the group is absent
 */
function groupCount(
  groups: Map<string, MoveGroup>,
  trackIndex: number,
  startBeats: number,
): number | undefined {
  return groups.get(moveGroupKey({ trackIndex, takeLane: null }, startBeats))
    ?.landed.size;
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
    // Only a deleted clip reads an empty path.
    path: `live_set tracks ${String(trackIndex ?? 0)} arrangement_clips 0`,
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
  reasons = newClipReasons();

  return handleArrangementStartOperation({
    clip,
    arrangementStartBeats,
    destination,
    movedClipGroups,
    isMidiClip: true,
    context: mockContext,
    updatedClips: [],
    noteResult: null,
    reasons,
  });
}

describe("arrangement-move", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleArrangementStartOperation", () => {
    it("reports an unknown track on the clip's own entry", () => {
      // Should not throw, just report it and return the original clip id
      const result = runStartOperation(clipStub("456", 1, null), 16);

      expect(clipReason("456")).toBe(
        "not moved: could not determine its track",
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

      // Real workaround, no mock: source [0,16] moved to 4 overlaps its own
      // target [4,20], so the move routes through holding — copy to holding,
      // delete the original, place a full copy — leaving one full-length clip
      // at the new position.
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
      registerMockObject("730", { type: "Clip" }); // temp clip

      const clipProps: Record<string, number> = {
        is_arrangement_clip: 1,
        start_time: 0,
        end_time: 16,
      };
      const mockClip = {
        id: "700",
        path: `live_set tracks ${trackIndex} arrangement_clips 0`,
        getProperty: vi.fn((prop) => clipProps[prop] ?? null),
        trackIndex,
        exists: () => true,
      };

      const movedClipGroups = new Map<string, MoveGroup>();

      const result = runStartOperation(
        mockClip as unknown as LiveAPI,
        4,
        movedClipGroups,
      );

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
          if (prop === "is_arrangement_clip") {
            return 1;
          }

          return null;
        }),
        trackIndex: 0,
      };

      const movedClipGroups = new Map<string, MoveGroup>();
      const result = runStartOperation(
        mockClip as unknown as LiveAPI,
        8,
        movedClipGroups,
      );

      // Should report the failure on the clip's entry and return its id
      expect(clipReason("100")).toBe(
        "not moved: Live made no copy at the destination, so the original was kept",
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
          moveGroupKey({ trackIndex, takeLane: null }, 64),
          {
            landing: { trackIndex, takeLane: null },
            startBeats: 64,
            landed: new Map([["earlier", { id: "earlier-copy", span: null }]]),
            deferred: [],
            cleared: [],
          },
        ],
      ]);

      runStartOperation(mockClip as unknown as LiveAPI, 64, movedClipGroups);

      expect(groupCount(movedClipGroups, trackIndex, 64)).toBe(2);
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
      // Nothing has landed on it yet either.
      expect(groupCount(movedClipGroups, 0, 16)).toBe(0);
      expect(
        movedClipGroups.get(moveGroupKey({ trackIndex: 0, takeLane: null }, 16))
          ?.deferred,
      ).toHaveLength(1);
      // The clip still gets its place in the response, in call order.
      expect(updatedClips).toStrictEqual([{ id: "200" }]);
    });

    it("does not re-delete the original when the move was unsafe and the clip is already gone", () => {
      const trackIndex = 0;
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
      });

      // Unsafe move (self-overlap): the holding round-trip already deleted the
      // original, so its path is empty and delete must be skipped — even though
      // a held object's exists() still says true.
      const clearSpy = vi
        .spyOn(arrangementWorkaround, "clearClipAtDuplicateTarget")
        .mockReturnValue(false);
      const dupSpy = vi
        .spyOn(arrangementWorkaround, "duplicateSelfOverlappingClip")
        .mockReturnValue({
          id: "new999",
          exists: () => true,
          // Live answers with no edges for a clip this stub never placed.
          getProperty: () => null,
        } as unknown as LiveAPI);

      const mockClip = {
        id: "888",
        getProperty: vi.fn((prop) =>
          prop === "is_arrangement_clip" ? 1 : null,
        ),
        trackIndex,
        path: "",
        exists: () => true,
      };

      const result = runStartOperation(mockClip as unknown as LiveAPI, 16);

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
        context: mockContext,
        updatedClips,
        noteResult: null,
        reasons: newClipReasons(),
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
        context: mockContext,
        updatedClips,
        noteResult: null,
        reasons: newClipReasons(),
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

// A move that lands on part of its own span leaves one clip, either direction:
// nothing of the source may survive past the copy.
describe("moving a clip onto part of its own span", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves no tail behind when it moves back less than its length", async () => {
    const entry = await moveFourBarClip("2|1");

    expect(stackedLaneSpans()).toStrictEqual([
      [0, 4],
      [4, 20],
    ]);
    expect(entry.path).toBe("t0[2|1]");
    expect(stackedLaneClips()).toContain(entry.id);
  });

  it("leaves no head behind when it moves forward less than its length", async () => {
    const entry = await moveFourBarClip("4|1");

    expect(stackedLaneSpans()).toStrictEqual([
      [0, 4],
      [12, 28],
    ]);
    expect(entry.path).toBe("t0[4|1]");
  });

  it("leaves one clip when it moves onto its own start", async () => {
    const entry = await moveFourBarClip("3|1");

    expect(stackedLaneSpans()).toStrictEqual([
      [0, 4],
      [8, 24],
    ]);
    expect(stackedLaneClips()).toContain(entry.id);
  });
});

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
      if (prop === "is_arrangement_clip") {
        return 1;
      }

      return null;
    }),
    trackIndex: opts.trackIndex,
  };

  if (opts.path != null) {
    mockClip.path = opts.path;
  }

  if (opts.exists != null) {
    mockClip.exists = opts.exists;
  }

  const movedClipGroups = new Map<string, MoveGroup>();
  const updatedClips: ClipResult[] = [];

  const result = handleArrangementStartOperation({
    clip: mockClip as unknown as LiveAPI,
    arrangementStartBeats: 16,
    destination: null,
    movedClipGroups,
    isMidiClip: true,
    context: mockContext,
    updatedClips,
    noteResult: null,
    reasons: newClipReasons(),
    isNonSurvivor: opts.isNonSurvivor,
  });

  return { result, movedClipGroups, updatedClips };
}

/**
 * Lay out a 1-bar clip then a 4-bar clip at beat 8, and move the 4-bar one.
 * @param arrangementStart - Where it goes
 * @returns The move's entry
 */
async function moveFourBarClip(arrangementStart: string): Promise<ClipResult> {
  const [, fourBars] = registerStackingTrack([4, 16]);

  return (await updateClip({ id: fourBars, arrangementStart })) as ClipResult;
}
