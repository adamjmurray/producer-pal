// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import * as arrangementWorkaround from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import {
  handleArrangementOperations,
  handleArrangementStartOperation,
} from "../../helpers/arrangement/update-clip-arrangement-helpers.ts";
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
    isMidiClip: true,
    context: mockContext,
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
        "arrangementStart parameter ignored for session clip (id 123)",
      );
      expect(result).toBe("123");
    });

    it("should warn and return original clip id when trackIndex is null for arrangement clips", () => {
      // Should not throw, just warn and return original clip id
      const result = runStartOperation(clipStub("456", 1, null), 16);

      expect(capturedWarnings()).toContain(
        "could not determine trackIndex for clip 456",
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
        isMidiClip: true,
        context: mockContext,
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
        isMidiClip: true,
        context: mockContext,
      });

      // Should warn about failure and return original clip ID
      expect(capturedWarnings()).toContain(
        "failed to duplicate clip 100 - original preserved",
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
      const movedClipGroups = new Map([
        [moveGroupKey(trackIndex, 64), { trackIndex, count: 2 }],
      ]);

      handleArrangementStartOperation({
        clip: mockClip as unknown as LiveAPI,
        arrangementStartBeats: 64,
        destination: null,
        movedClipGroups,
        isMidiClip: true,
        context: mockContext,
      });

      expect(groupCount(movedClipGroups, trackIndex, 64)).toBe(3);
    });

    it("should delete clip and return null for non-survivors", () => {
      const { trackMock, result, movedClipGroups } = callWithNonSurvivorClip({
        clipExists: true,
      });

      // Should delete the clip and return null
      expect(result).toBeNull();
      expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 200");
      // Should NOT call duplicate_clip_to_arrangement
      expect(trackMock.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.anything(),
        expect.anything(),
      );
      // Should still increment move count
      expect(groupCount(movedClipGroups, 0, 16)).toBe(1);
    });

    it("should warn and skip deletion for already-deleted non-survivor clips", () => {
      const { trackMock, result, movedClipGroups } = callWithNonSurvivorClip({
        clipExists: false,
      });

      expect(result).toBeNull();
      expect(capturedWarnings()).toContain(
        "non-survivor clip 200 already deleted, skipping",
      );
      // Should NOT call delete_clip since clip doesn't exist
      expect(trackMock.call).not.toHaveBeenCalledWith(
        "delete_clip",
        expect.anything(),
      );
      // Should still increment move count
      expect(groupCount(movedClipGroups, 0, 16)).toBe(1);
    });

    it("warns and returns original ID for take-lane clips without calling Track APIs", () => {
      const trackIndex = 4;
      const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
        path: `live_set tracks ${trackIndex}`,
        methods: {
          duplicate_clip_to_arrangement: () => ["id", 0],
        },
      });

      const { result, movedClipGroups } = callArrangementStart({
        clipId: "777",
        trackIndex,
        path: `live_set tracks ${trackIndex} take_lanes 0 arrangement_clips 0`,
      });

      expect(result).toBe("777");
      expect(capturedWarnings()).toContain(
        "arrangementStart ignored for take-lane clip (id 777): Live's API can't move a clip off a take lane. Drag it in Live's UI, or use ppal-duplicate to copy it elsewhere",
      );
      // Neither duplicate_clip_to_arrangement nor delete_clip should fire —
      // both are Track-scoped APIs that silently misroute on take-lane clips.
      expect(trackMock.call).not.toHaveBeenCalled();
      // Also: do not increment the move count for a skipped take-lane clip.
      expect(movedClipGroups.size).toBe(0);
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
        isMidiClip: true,
        context: mockContext,
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

      const updatedClips: { id: string }[] = [];

      handleArrangementOperations({
        clip: mockClip as unknown as LiveAPI,
        isAudioClip: false,
        arrangementStartBeats: 16,
        arrangementLengthBeats: null,
        movedClipGroups: new Map(),
        context: mockContext,
        updatedClips,
        noteResult: null,
        isNonSurvivor: true,
      });

      // Non-survivor is deleted and start-op returns null → early return, so
      // nothing is pushed to updatedClips.
      expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 200");
      expect(updatedClips).toStrictEqual([]);
    });
  });
});

/**
 * Sets up a non-survivor clip scenario and calls handleArrangementStartOperation.
 * @param root0 - Options
 * @param root0.clipExists - Whether the clip exists
 * @returns The result of handleArrangementStartOperation
 */
function callWithNonSurvivorClip({ clipExists }: { clipExists: boolean }) {
  const trackIndex = 0;

  const trackMock = registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: `live_set tracks ${trackIndex}`,
  });

  const { result, movedClipGroups } = callArrangementStart({
    clipId: "200",
    trackIndex,
    isNonSurvivor: true,
    exists: () => clipExists,
  });

  return { trackMock, result, movedClipGroups };
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

  const result = handleArrangementStartOperation({
    clip: mockClip as unknown as LiveAPI,
    arrangementStartBeats: 16,
    destination: null,
    movedClipGroups,
    isMidiClip: true,
    context: mockContext,
    isNonSurvivor: opts.isNonSurvivor,
  });

  return { result, movedClipGroups };
}
