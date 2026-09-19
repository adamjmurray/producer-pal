// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A batch move can destroy a clip the same call names, and used to report it as
// if the update had run: the batch reached a dead object, read nothing off it,
// and answered with why a session clip can't be moved.
//
// The move ordering keeps a batch out of its own way, but not when the clips
// are sent to one spot: that stack is what the call asked for, so the clip that
// lands first is cleared by the one after it. Same on both lane kinds.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  deleteMockObject,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  registerArrangementClip,
  registerLiveSet,
  registerStackingTrack,
  stackedLaneClips,
} from "./stacking-track-test-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

/** What a buried clip's entry says it was. */
const BURIED = "another clip in this call was moved onto it";

/** The clip the main-lane duplicate lands, so a test can name it. */
const LANDED = "landed";

/**
 * Seed a take lane and hand back the clips on it.
 * @param spans - Each clip's arrangement span, in beats
 * @returns Their ids, in lane order
 */
function seedTakeLane(spans: Array<{ start: number; end: number }>): string[] {
  registerLiveSet();
  registerTakeLaneTrack({ initialLanes: 1, initialLaneClips: [spans] });

  return spans.map(
    (_span, index) =>
      lookupMockObject(
        undefined,
        livePath.track(0).takeLane(0).arrangementClip(index),
      )?.id as string,
  );
}

/**
 * Track 0, answering the arrangement duplicate the way Live does: it clears the
 * destination range before the copy lands.
 * @param clipIds - The clips already on the track
 * @param length - The length of the clip the duplicate lands
 */
function registerMainLaneTrack(clipIds: string[], length: number): void {
  registerMockObject("main-lane-track", {
    path: livePath.track(0),
    type: "Track",
    properties: { arrangement_clips: children(...clipIds) },
    methods: {
      duplicate_clip_to_arrangement: (_id, start) => {
        for (const id of clipIds) {
          const props = lookupMockObject(id)?.properties;

          if (
            typeof props?.start_time === "number" &&
            props.start_time >= (start as number) &&
            props.start_time < (start as number) + length
          ) {
            deleteMockObject(id);
          }
        }

        registerArrangementClip(
          LANDED,
          clipIds.length,
          start as number,
          (start as number) + length,
        );

        return ["id", LANDED];
      },
      delete_clip: () => null,
    },
  });
}

/**
 * Seed a take lane, then send both of its clips to bar 5 so the second lands
 * on top of the first.
 * @param spans - Each clip's arrangement span, in beats
 * @returns The two clip ids and the response, one entry per id
 */
async function collideAtBarFive(
  spans: Array<{ start: number; end: number }>,
): Promise<{ first?: string; second?: string; result: ClipResult[] }> {
  const [first, second] = seedTakeLane(spans);
  const result = (await updateClip({
    id: `${first},${second}`,
    toPath: "t0/l0[5|1],t0/l0[5|1]",
  })) as ClipResult[];

  return { first, second, result };
}

describe("updateClip reports a clip the batch buried", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the take-lane clip a sibling was re-created on top of", async () => {
    const { second, result } = await collideAtBarFive([
      { start: 0, end: 4 },
      { start: 16, end: 20 },
    ]);

    // The mover landed at bar 5; the clip that was sitting there is gone, named
    // by the address it had, and says nothing about being a session clip.
    expect(result[0]?.path).toBe("t0/l0[5|1]");
    expect(result[1]).toStrictEqual({
      id: second,
      path: "t0/l0[5|1]",
      deleted: true,
      reason: `not updated: ${BURIED}`,
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("reports the main-lane clip a longer sibling landed on first", async () => {
    registerLiveSet();
    registerArrangementClip("long", 0, 0, 32);
    registerArrangementClip("short", 1, 100, 104);
    registerMainLaneTrack(["long", "short"], 32);

    const result = (await updateClip({
      id: "long,short",
      arrangementStart: "26|1,26|1",
    })) as ClipResult[];

    expect(result).toStrictEqual([
      { id: LANDED, path: "t0[26|1]" },
      {
        id: "short",
        path: "t0[26|1]",
        deleted: true,
        reason: `not updated: ${BURIED}`,
      },
    ]);
    // Only one clip ever landed there, so nothing stacked.
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("marks a clip that landed and a later sibling then buried", async () => {
    // Both land on bar 5: the first is re-created there, the second over it.
    const { result } = await collideAtBarFive([
      { start: 0, end: 4 },
      { start: 32, end: 36 },
    ]);

    // The first mover's own copy is what the second one cleared, so its entry
    // names an id that is gone by the time the call answers.
    expect(result[0]?.path).toBe("t0/l0[5|1]");
    expect(result[0]?.deleted).toBe(true);
    expect(result[0]?.reason).toContain(BURIED);
    expect(result[1]?.deleted).toBeUndefined();
  });

  it("reads nothing back for a batch that clears no span", async () => {
    const [first, second] = seedTakeLane([
      { start: 0, end: 4 },
      { start: 16, end: 20 },
    ]);

    const result = (await updateClip({
      id: `${first},${second}`,
      name: "Renamed",
    })) as ClipResult[];

    expect(result.map((entry) => entry.deleted)).toStrictEqual([
      undefined,
      undefined,
    ]);
  });
});

describe("a clip the call holds back for an overwrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The blocker stayed put by design, not because Live turned its move down,
  // and nothing clears it until every move has run — so "move that clip first"
  // is advice the caller can't take.
  it("says the call clears it only after every move has run", async () => {
    registerLiveSet();
    // "held" is shorter than "mover" and headed for the same spot, so the plan
    // holds it back for "mover" to land on top of. "waiter" is sent to the span
    // "held" is still sitting in.
    registerArrangementClip("held", 0, 0, 8);
    registerArrangementClip("mover", 1, 16, 32);
    registerArrangementClip("waiter", 2, 40, 44);
    registerMainLaneTrack(["held", "mover", "waiter"], 16);

    const result = (await updateClip({
      id: "held,mover,waiter",
      arrangementStart: "17|1,17|1,1|1",
    })) as ClipResult[];

    expect(result[0]).toStrictEqual({
      id: "held",
      path: "t0[1|1]",
      deleted: true,
    });
    expect(result[2]).toStrictEqual({
      id: "waiter",
      ok: false,
      reason:
        "not moved: it would land on clip t0[1|1] (id held), which this call " +
        "clears only after every move has run; use separate calls",
    });
  });

  // The read-back would find it gone and say a sibling was moved onto it, which
  // is what the call planned all along. Its own settling says it plainly.
  it("leaves the plain deleted entry alone when the landing cleared it", async () => {
    registerLiveSet();
    // "held" is already sitting on the spot both clips are sent to, and it is
    // shorter, so the landing clears it before the call settles it.
    registerArrangementClip("held", 0, 64, 72);
    registerArrangementClip("mover", 1, 16, 32);
    registerMainLaneTrack(["held", "mover"], 16);

    const result = (await updateClip({
      id: "held,mover",
      arrangementStart: "17|1,17|1",
    })) as ClipResult[];

    expect(result[0]).toStrictEqual({
      id: "held",
      path: "t0[17|1]",
      deleted: true,
    });
    expect(result[1]?.id).toBe(LANDED);
    expect(capturedWarnings()).toStrictEqual([
      "2 clips on t0 moved to the same position - later clips will overwrite earlier ones",
    ]);
  });
});

/**
 * Move every clip on the simulated track.
 * @param lengths - The clips' lengths in beats, in call order
 * @param starts - Where each one goes, in call order (default bar 101)
 * @returns The call's entries, in call order
 */
async function moveAll(
  lengths: number[],
  starts?: string[],
): Promise<ClipResult[]> {
  const ids = registerStackingTrack(lengths);

  return (await updateClip({
    id: ids.join(","),
    arrangementStart: (starts ?? ids.map(() => "101|1")).join(","),
  })) as ClipResult[];
}

describe("a survivor a shorter clip landed on", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The 2 landing on top of the 8 trims its front instead of burying it, and
  // the trim gives it a new id — which used to read as "gone".
  it("reports where the trim left it, not as deleted", async () => {
    const result = await moveAll([4, 8, 2]);

    expect(result[0]?.deleted).toBe(true);
    expect(result[1]).toStrictEqual({
      id: expect.any(String),
      path: "t0[101|3]",
      arrangementLength: "1bar+n/2",
      reason: "trimmed: another clip in this call landed on its start",
    });
    expect(result[2]?.path).toBe("t0[101|1]");
    expect(result[2]?.deleted).toBeUndefined();
    // The trim re-created it, so the entry has to name the clip that is there.
    expect(stackedLaneClips()).toContain(result[1]?.id);
  });

  // Survivors descend in length, but a non-survivor can outlast a later,
  // shorter one: the 12 trims the 40 without being long enough to bury the 20.
  it("reports the trim when a non-survivor sits between the lengths", async () => {
    const result = await moveAll([20, 40, 12]);

    expect(result[0]?.deleted).toBe(true);
    expect(result[1]?.deleted).toBeUndefined();
    expect(result[1]?.path).toBe("t0[104|1]");
    expect(result[2]?.deleted).toBeUndefined();
  });

  // The remainder is only a prediction until something is found there: a later
  // clip landing across the whole stack leaves nothing to report.
  it("still reports a trimmed clip a later landing then buried", async () => {
    const result = await moveAll([8, 2, 16], ["101|1", "101|1", "100|1"]);

    expect(result[0]?.deleted).toBe(true);
    expect(result[0]?.reason).toContain(BURIED);
    expect(result[1]?.deleted).toBe(true);
    expect(result[2]?.path).toBe("t0[100|1]");
    expect(result[2]?.deleted).toBeUndefined();
  });

  // Everything in a group starts at the same beat, so a landing from another
  // group can start exactly where the remainder was predicted. Only the end
  // tells them apart: the trim leaves it where it was.
  it("does not mistake a landing at the trim point for the remainder", async () => {
    const result = await moveAll([8, 2, 12], ["101|1", "101|1", "101|3"]);

    expect(result[0]?.deleted).toBe(true);
    expect(result[0]?.reason).toContain(BURIED);
    expect(result[1]?.path).toBe("t0[101|1]");
    expect(result[2]?.path).toBe("t0[101|3]");
  });

  // Same shape, but the landing at the trim point is short enough to leave
  // something: the remainder is past it, still ending where it always did.
  it("follows a remainder a second landing pushed further along", async () => {
    const result = await moveAll([8, 2, 4], ["101|1", "101|1", "101|3"]);

    expect(result[0]?.deleted).toBeUndefined();
    expect(result[0]?.path).toBe("t0[102|3]");
    expect(result[0]?.reason).toContain("trimmed:");
    expect(stackedLaneClips()).toContain(result[0]?.id);
    expect(result[2]?.path).toBe("t0[101|3]");
  });

  // Every clip survives, so every one but the last is trimmed by the next.
  it("reports each clip of a descending stack", async () => {
    const result = await moveAll([8, 4, 2]);

    expect(result.map((entry) => entry.deleted)).toStrictEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(result.map((entry) => entry.path)).toStrictEqual([
      "t0[102|1]",
      "t0[101|3]",
      "t0[101|1]",
    ]);
    // Each trimmed entry reports what is left: 8 minus 4, then 4 minus 2.
    expect(result.map((entry) => entry.arrangementLength)).toStrictEqual([
      "1bar",
      "n/2",
      undefined,
    ]);
  });
});
