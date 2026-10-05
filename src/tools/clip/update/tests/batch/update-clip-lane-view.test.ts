// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// One call's arrangement edits share one view of each lane: it is read once,
// and every write after that says what it changed, so a move or a resize reads
// only the clips it touches instead of the whole lane again.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { handleArrangementOperations } from "../../helpers/arrangement/arrangement-move.ts";
import { newLandingLog } from "#src/tools/shared/clip/landings/landing-log.ts";
import {
  newClipReasons,
  type ClipReasons,
} from "../../helpers/entries/clip-reasons.ts";
import { joinedClipReason } from "../../helpers/update-clip-test-helpers.ts";
import {
  expectUntouchedClipsReadOnce,
  makeLooping,
  readsOf,
  registerStackingTrack,
  stackedLaneSpans,
} from "./stacking-track-test-helpers.ts";

/** Clips on the track, each 4 beats long, one every 8 beats from beat 0. */
const LANE = 40;

describe("update-clip over a long lane", () => {
  let ids: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    ids = registerStackingTrack(Array.from({ length: LANE }, () => 4));
  });

  it("reads each clip a batch of moves doesn't touch once, not once per move", async () => {
    const from = vi.spyOn(LiveAPI, "from");
    // Clips 1-4 onto the places clips 20-23 sit.
    const result = (await updateClip({
      ids: ids.slice(0, 4).join(","),
      arrangementStart: "39|1,41|1,43|1,45|1",
    })) as ClipResult[];

    expect(result.map(({ path, detail }) => [path, detail])).toStrictEqual([
      ["t0[39|1]", "overwrote the clip at t0[39|1]"],
      ["t0[41|1]", "overwrote the clip at t0[41|1]"],
      ["t0[43|1]", "overwrote the clip at t0[43|1]"],
      ["t0[45|1]", "overwrote the clip at t0[45|1]"],
    ]);

    // The far end of the lane: scanned for its end and start, and no more.
    const far = ids.slice(30);

    expectUntouchedClipsReadOnce(from, far);
  });

  it("reads each clip a batch of paths and moves doesn't touch once, paths included", async () => {
    const from = vi.spyOn(LiveAPI, "from");
    // The clips at bars 1, 3, 5 and 7, found by where they are, then moved.
    const result = (await updateClip({
      path: "t0[1|1],t0[3|1],t0[5|1],t0[7|1]",
      arrangementStart: "39|1,41|1,43|1,45|1",
    })) as ClipResult[];

    expect(result.map(({ path }) => path)).toStrictEqual([
      "t0[39|1]",
      "t0[41|1]",
      "t0[43|1]",
      "t0[45|1]",
    ]);

    // Four lookups and four moves, and the far end of the lane was read once.
    const far = ids.slice(30);

    expectUntouchedClipsReadOnce(from, far);
  });

  it("reads each clip a batch of lengthenings doesn't touch once", async () => {
    makeLooping(ids[0] as string);
    makeLooping(ids[10] as string);

    const result = (await updateClip({
      ids: `${ids[0]},${ids[10]}`,
      arrangementLength: "4bar,4bar",
    })) as ClipResult[];

    // Each grew over the clip after it, with its tiles; the first tile says so.
    expect(
      result.map(({ detail }) => detail).filter((detail) => detail != null),
    ).toStrictEqual([
      "overwrote the clip at t0[3|1]",
      "overwrote the clip at t0[23|1]",
    ]);

    const far = ids.slice(20);

    expect(readsOf(far)).toStrictEqual(far.map(() => 2));
  });

  describe("an edit after another in the same call", () => {
    let reasons: ClipReasons;
    let context: { silenceWavPath: string; lanes: LaneView };

    beforeEach(() => {
      reasons = newClipReasons();
      context = {
        silenceWavPath: "/tmp/test-silence.wav",
        lanes: new LaneView(),
      };
    });

    /**
     * Run one clip's arrangement edit in the call's shared context.
     * @param clipId - The clip
     * @param change - What to do with it
     * @param change.arrangementStartBeats - Where to move it
     * @param change.arrangementLengthBeats - What length to give it
     */
    function edit(
      clipId: string,
      change: {
        arrangementStartBeats?: number;
        arrangementLengthBeats?: number;
      },
    ): void {
      handleArrangementOperations({
        clip: LiveAPI.from(clipId),
        isAudioClip: false,
        ...change,
        landings: newLandingLog(),
        context,
        updatedClips: [],
        noteResult: null,
        reasons,
      });
    }

    it("sees that an earlier clip was shortened, so a move onto its old tail clears nothing", () => {
      // Clip 1 fills [0, 16]; clip 2 sits at [20, 24].
      const [first, second] = registerStackingTrack([16, 4, 4, 4]);

      edit(first as string, { arrangementLengthBeats: 8 });
      expect(stackedLaneSpans()[0]).toStrictEqual([0, 8]);

      const track = lookupMockObject("stacking-track");
      const tempClipsBefore = track?.call.mock.calls.filter(
        ([name]) => name === "create_midi_clip",
      ).length;

      edit(second as string, { arrangementStartBeats: 12 });

      // The tail it moved onto was free, so no temp clip was laid to clear it,
      // and its entry has nothing to say about the clip that was shortened.
      expect(
        track?.call.mock.calls.filter(([name]) => name === "create_midi_clip")
          .length,
      ).toBe(tempClipsBefore);
      expect(joinedClipReason(reasons, second as string)).toBe("");
      expect(stackedLaneSpans().slice(0, 2)).toStrictEqual([
        [0, 8],
        [12, 16],
      ]);
    });

    it("sees that an earlier clip landed, so a later move onto it says it overwrote it", () => {
      const [first, second, third] = registerStackingTrack([4, 4, 4, 4]);

      edit(first as string, { arrangementStartBeats: 40 });
      edit(second as string, { arrangementStartBeats: 40 });

      // The second landing covered the first: its entry names the clip at 40.
      expect(joinedClipReason(reasons, second as string)).toBe(
        "overwrote the clip at t0[11|1]",
      );
      expect(joinedClipReason(reasons, third as string)).toBe("");
      expect(stackedLaneSpans().map(([start]) => start)).toStrictEqual([
        16, 24, 40,
      ]);
    });
  });
});
