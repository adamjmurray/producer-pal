// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
        const left: string[] = [];

        for (const id of clipIds) {
          const props = lookupMockObject(id)?.properties;

          if (
            typeof props?.start_time === "number" &&
            props.start_time >= (start as number) &&
            props.start_time < (start as number) + length
          ) {
            deleteMockObject(id);
          } else {
            left.push(id);
          }
        }

        registerArrangementClip(
          LANDED,
          clipIds.length,
          start as number,
          (start as number) + length,
        );
        // The lane's own list shows the clip cleared gone and the copy there.
        registerMockObject("main-lane-track", {
          properties: { arrangement_clips: children(...left, LANDED) },
        });

        return ["id", LANDED];
      },
      delete_clip: () => null,
    },
  });
}

/**
 * Seed a take lane, then send its clips to bar 5, or wherever `at` says, so
 * each lands on top of the one before.
 * @param spans - Each clip's arrangement span, in beats
 * @param at - Where each goes, as positions on the lane (default bar 5)
 * @returns The clip ids and the response, one entry per id
 */
async function collideAtBarFive(
  spans: Array<{ start: number; end: number }>,
  at: string[] = spans.map(() => "5|1"),
): Promise<{ ids: string[]; result: ClipResult[] }> {
  const ids = seedTakeLane(spans);
  const result = (await updateClip({
    id: ids.join(","),
    toPath: at.map((position) => `t0/l0[${position}]`).join(","),
  })) as ClipResult[];

  return { ids, result };
}

describe("updateClip reports a clip the batch buried", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the take-lane clip a sibling was re-created on top of", async () => {
    const { ids, result } = await collideAtBarFive([
      { start: 0, end: 4 },
      { start: 16, end: 20 },
    ]);

    // The first mover is left where it was: the second lands on the same spot
    // and covers all of it, so the first's move is the one that is skipped.
    expect(result).toStrictEqual([
      {
        id: ids[0],
        detail: "overwritten later in this call by t0/l0[5|1]",
      },
      expect.objectContaining({ path: "t0/l0[5|1]" }),
    ]);
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
      {
        id: LANDED,
        path: "t0[26|1]",
        // The long clip's own landing is what cleared the short one out of
        // the way, so its entry says so.
        detail: "overwrote the clip at t0[26|1]",
      },
      {
        id: "short",
        ok: false,
        detail:
          "not updated: the clip was overwritten earlier in this call by t0[26|1]",
      },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("says a clip was overwritten when later landings cover all of it between them", async () => {
    // The first (8 beats) lands on bar 5; the second (4) and the third (4)
    // each cover half of it, so neither alone does.
    const { ids, result } = await collideAtBarFive(
      [
        { start: 0, end: 8 },
        { start: 32, end: 36 },
        { start: 64, end: 68 },
      ],
      ["5|1", "5|1", "6|1"],
    );

    expect(result[0]).toStrictEqual({
      id: ids[0],
      detail: "overwritten later in this call by t0/l0[6|1]",
    });
    expect(result[1]?.path).toBe("t0/l0[5|1]");
    expect(result[2]?.path).toBe("t0/l0[6|1]");
  });

  // The second move fails after Live made its clip, and that half-made clip
  // covers the first one's landing. It is nobody's rest. (The third move is
  // there because a lone landed entry skips the read-back.)
  it("does not name a half-made clip as the rest of one it buried", async () => {
    registerLiveSet();
    registerTakeLaneTrack({
      initialLanes: 1,
      initialLaneClips: [
        [
          { start: 0, end: 4 },
          { start: 32, end: 36 },
          { start: 64, end: 68 },
        ],
      ],
      postCreateFails: true,
    });

    const [first, second, third] = [0, 1, 2].map(
      (index) =>
        lookupMockObject(
          undefined,
          livePath.track(0).takeLane(0).arrangementClip(index),
        )?.id as string,
    );

    // Only the second has notes, so only its re-create fails.
    const secondClip = lookupMockObject(second);

    registerMockObject(second as string, {
      type: "Clip",
      properties: secondClip?.properties,
      methods: {
        get_notes_extended: () =>
          JSON.stringify({
            notes: [{ pitch: 60, start_time: 0, duration: 1, velocity: 100 }],
          }),
      },
    });

    const result = (await updateClip({
      id: `${first},${second},${third}`,
      toPath: "t0/l0[5|1],t0/l0[5|1],t0/l0[20|1]",
    })) as ClipResult[];

    expect(result[1]?.detail).toContain("an incomplete clip was left");
    // The move that was to replace it failed, so nothing did.
    expect(result[0]).toStrictEqual({
      id: first,
      ok: false,
      detail: "not written: t0/l0[5|1] was meant to replace it, but failed",
    });
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

    expect(result.every((entry) => !("deleted" in entry))).toBe(true);
  });
});

describe("a clip the call holds back for an overwrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // "held" is left unwritten, so it stays where it is; what is sent there
  // afterwards lands over it, and says so on its own entry.
  it("leaves it where it sits for a clip sent to its span to land over", async () => {
    registerLiveSet();
    // "held" is shorter than "mover" and headed for the same spot, so "mover"
    // covers it. "waiter" is sent to the span "held" is still sitting in.
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
      detail: "overwritten later in this call by t0[17|1]",
    });
    // Not blocked by "held": it lands, at bar 1, where "held" still sits.
    expect(result[2]).toStrictEqual(
      expect.objectContaining({ path: "t0[1|1]" }),
    );
    expect(result[2]).not.toHaveProperty("ok");
  });

  // The read-back would find it gone too; the detail must not be said twice.
  it("says once that it was overwritten when the landing cleared it", async () => {
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

    // Its move was never written, but the mover's landing cleared the clip where
    // it sat: it names nothing now, and the mover says what it destroyed.
    expect(result[0]).toStrictEqual({
      detail: "overwritten later in this call by t0[17|1]",
    });
    expect(result[1]).toStrictEqual({
      id: LANDED,
      path: "t0[17|1]",
      detail: "overwrote the clip at t0[17|1]",
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });
});

/**
 * Expect an entry to say a later write of the call went over its clip, without
 * claiming the clip was deleted or that the call failed.
 * @param entry - The clip's result entry
 */
function expectOverwritten(entry: ClipResult | undefined): void {
  expect(entry).not.toHaveProperty("deleted");
  expect(entry).not.toHaveProperty("ok");
  expect(entry?.detail).toContain("overwritten later in this call");
}

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

describe("a clip a shorter clip landed on", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The 2 landing on top of the 8 trims its front instead of burying it, and
  // the trim gives it a new id — which used to read as "gone".
  it("reports where the trim left it, not as deleted", async () => {
    const result = await moveAll([4, 8, 2]);

    expectOverwritten(result[0]);
    expect(result[1]).toStrictEqual({
      id: expect.any(String),
      path: "t0[101|3]",
      arrangementLength: "1bar+n/2",
      detail: expect.stringContaining("shortened by"),
    });
    expect(result[2]?.path).toBe("t0[101|1]");
    expect(result[2]).not.toHaveProperty("deleted");
    // The trim re-created it, so the entry has to name the clip that is there.
    expect(stackedLaneClips()).toContain(result[1]?.id);
  });

  // A clip can outlast a later, shorter one: the 12 trims the 40 without being
  // long enough to cover the 20, which the 40 covers whole.
  it("reports the trim when a covered clip sits between the lengths", async () => {
    const result = await moveAll([20, 40, 12]);

    expectOverwritten(result[0]);
    expect(result[1]).not.toHaveProperty("deleted");
    expect(result[1]?.path).toBe("t0[104|1]");
    expect(result[2]).not.toHaveProperty("deleted");
  });

  // The remainder is only a prediction until something is found there: a later
  // clip landing across the whole stack leaves nothing to report.
  it("still reports a trimmed clip a later landing then buried", async () => {
    const result = await moveAll([8, 2, 16], ["101|1", "101|1", "100|1"]);

    expectOverwritten(result[0]);
    expectOverwritten(result[1]);
    expect(result[2]?.path).toBe("t0[100|1]");
    expect(result[2]).not.toHaveProperty("deleted");
  });

  // Everything in a group starts at the same beat, so a landing from another
  // group can start exactly where the remainder was predicted. Only the end
  // tells them apart: the trim leaves it where it was.
  it("does not mistake a landing at the trim point for the remainder", async () => {
    const result = await moveAll([8, 2, 12], ["101|1", "101|1", "101|3"]);

    expectOverwritten(result[0]);
    expect(result[1]?.path).toBe("t0[101|1]");
    expect(result[2]?.path).toBe("t0[101|3]");
  });

  // Same shape, but the landing at the trim point is short enough to leave
  // something: the remainder is past it, still ending where it always did.
  it("follows a remainder a second landing pushed further along", async () => {
    const result = await moveAll([8, 2, 4], ["101|1", "101|1", "101|3"]);

    expect(result[0]).not.toHaveProperty("deleted");
    expect(result[0]?.path).toBe("t0[102|3]");
    expect(result[0]?.detail).toContain("shortened by");
    expect(stackedLaneClips()).toContain(result[0]?.id);
    expect(result[2]?.path).toBe("t0[101|3]");
  });

  // Two stacks end at one beat: the 28 lands over what the 8 left of the 32,
  // then the 4 trims the 28. Both trimmed entries predict a rest ending there,
  // but only the 28's is left, so only its entry may name it.
  it("names a shared-end remainder once, for the landing that left it", async () => {
    const result = await moveAll(
      [32, 8, 28, 4],
      ["101|1", "101|1", "102|1", "102|1"],
    );

    expectOverwritten(result[0]);
    expect(result[2]?.path).toBe("t0[103|1]");
    expect(result[2]?.detail).toContain("shortened by");
    expect(stackedLaneClips()).toContain(result[2]?.id);
    expect(new Set(result.map((entry) => entry.id)).size).toBe(4);
  });

  // The 24 lands whole where the 32's rest would end, and its own entry names
  // it: the 32's entry must not name it too.
  it("does not name a sibling's own landing as a remainder", async () => {
    const result = await moveAll([32, 8, 24], ["101|1", "101|1", "103|1"]);

    expectOverwritten(result[0]);
    expect(result[2]?.path).toBe("t0[103|1]");
    expect(result[2]?.detail).toBeUndefined();
    expect(new Set(result.map((entry) => entry.id)).size).toBe(3);
  });

  // The 16 cuts the back off what the 8 left of the 32: the rest no longer
  // ends where the 32 did, but it is still there.
  it("reports a remainder a later landing cut short at the back", async () => {
    const result = await moveAll([32, 8, 16], ["101|1", "101|1", "105|1"]);

    expect(result[0]).toStrictEqual({
      id: expect.any(String),
      path: "t0[103|1]",
      arrangementLength: "2bar",
      detail: expect.stringContaining("shortened by"),
    });
    expect(stackedLaneClips()).toContain(result[0]?.id);
    expect(new Set(result.map((entry) => entry.id)).size).toBe(3);
  });

  // The 4 lands inside what the 8 left of the 32, splitting it in two. The
  // entry names the piece that ends where the 32 did.
  it("names the end piece of a remainder split in two", async () => {
    const result = await moveAll([32, 8, 4], ["101|1", "101|1", "105|1"]);

    expect(result[0]?.path).toBe("t0[106|1]");
    expect(result[0]?.arrangementLength).toBe("3bar");
    expect(result[0]).not.toHaveProperty("deleted");
    expect(stackedLaneClips()).toContain(result[0]?.id);
  });

  // Same split, then the last 4 cuts the end piece short: nothing of the 32 ends
  // where it did, so the entry names its earliest piece.
  it("names the earliest piece once the end piece is cut short", async () => {
    const result = await moveAll(
      [32, 8, 4, 4],
      ["101|1", "101|1", "105|1", "108|1"],
    );

    expect(result[0]?.path).toBe("t0[103|1]");
    expect(result[0]?.arrangementLength).toBe("2bar");
    expect(result[0]).not.toHaveProperty("deleted");
    expect(stackedLaneClips()).toContain(result[0]?.id);
    expect(new Set(result.map((entry) => entry.id)).size).toBe(4);
  });

  // An arrangementLength that keeps the 16's length writes nothing, so the
  // rest the 4 left is still the 16's.
  it("names the rest of a clip resized to its own length", async () => {
    const ids = registerStackingTrack([16, 4]);
    const result = (await updateClip({
      id: ids.join(","),
      arrangementStart: "101|1,101|1",
      arrangementLength: "4bar,1bar",
    })) as ClipResult[];

    expect(result[0]).not.toHaveProperty("deleted");
    expect(result[0]?.path).toBe("t0[102|1]");
    expect(result[0]?.arrangementLength).toBe("3bar");
    expect(stackedLaneClips()).toContain(result[0]?.id);
  });

  // Every clip survives, so every one but the last is trimmed by the next.
  it("reports each clip of a descending stack", async () => {
    const result = await moveAll([8, 4, 2]);

    expect(result.every((entry) => !("deleted" in entry))).toBe(true);
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

// Pieces of a sibling's clip can lie inside this clip's span: a sibling that
// landed inside it and was then split or front-cut. They are the sibling's.
describe("a sibling's pieces inside a clip's span", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The last 2 splits the 8, whose tail lies where the 16 was.
  it("does not name a sibling's split tail", async () => {
    const result = await moveAll(
      [16, 4, 8, 8, 2],
      ["101|1", "101|1", "102|1", "104|1", "102|3"],
    );

    expectOverwritten(result[0]);
    expect(result[2]?.path).toBe("t0[102|1]");
  });

  // Same, when the split tail is all that is left where the 16 ended.
  it("does not name a sibling's split tail that ends where it did", async () => {
    const result = await moveAll(
      [16, 4, 12, 2],
      ["101|1", "101|1", "102|1", "103|1"],
    );

    expectOverwritten(result[0]);
  });

  // The 6 cuts the front off the second 4, which landed inside the 16. What is
  // left is that 4's, and its entry has to say so.
  it("gives a sibling's front-cut rest to the sibling", async () => {
    const result = await moveAll(
      [16, 4, 4, 6, 8],
      ["101|1", "101|1", "103|1", "102|1", "104|1"],
    );

    expectOverwritten(result[0]);
    expect(result[2]).not.toHaveProperty("deleted");
    expect(result[2]?.path).toBe("t0[103|3]");
    expect(result[2]?.arrangementLength).toBe("n/2");
    expect(result[2]?.detail).toContain("shortened by");
    expect(stackedLaneClips()).toContain(result[2]?.id);
  });

  // Both clips keep a piece: the 16 its front, cut short by the last 4, and
  // the 8 its back.
  it("names each clip's own piece when both survive", async () => {
    const result = await moveAll(
      [16, 4, 8, 4],
      ["101|1", "101|1", "103|1", "102|3"],
    );

    expect(result[0]?.path).toBe("t0[102|1]");
    expect(result[0]?.arrangementLength).toBe("n/2");
    expect(result[2]?.path).toBe("t0[103|3]");
    expect(result[2]?.arrangementLength).toBe("1bar+n/2");
    expect(stackedLaneClips()).toStrictEqual(
      expect.arrayContaining([result[0]?.id, result[2]?.id]),
    );
  });

  // The 16 lands inside what is left of the 32 and is lengthened to 6 bars,
  // over where the 32 ended. What the lengthen wrote is the 16's, not a piece
  // of the 32.
  it("does not name a piece a sibling's lengthen wrote", async () => {
    const ids = registerStackingTrack([32, 16, 8, 8]);
    const result = (await updateClip({
      id: ids.join(","),
      arrangementStart: "101|1,101|1,104|1,107|1",
      arrangementLength: "8bar,6bar,2bar,2bar",
    })) as ClipResult[];

    expectOverwritten(result[0]);
  });
});
