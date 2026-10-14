// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Copies that land on their own source clip each trim what is left of it, so
// two or more of them are made from a spare of the source: a copy made from
// the trimmed source would be short. These run the real clearing against a lane
// that overwrites the way Live does, where a copy is as long as its source is
// at that moment.

import { afterEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerLiveLane,
  type LiveLane,
} from "#src/tools/actions/duplicate/tests/clip/overwrites/duplicate-live-lane-test-helpers.ts";

const { updateClipMock } = vi.hoisted(() => ({ updateClipMock: vi.fn() }));

// Growing a copy is update-clip's job; the lane stands in for what it does.
vi.mock(
  import("#src/tools/clip/update/update-clip.ts"),
  () => ({ updateClip: updateClipMock }) as never,
);

type Method = (...args: unknown[]) => unknown;

/** The song is 4/4, and the source is 4 bars at the start of track 0. */
function registerSourceOnTrack0(): LiveLane {
  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  return registerLiveLane({
    trackIndex: 0,
    clips: [{ id: "src", start: 0, end: 16 }],
    copiesSourceLength: true,
  });
}

/**
 * Make one of a lane's arrangement duplicates throw.
 * @param lane - The lane
 * @param nth - Which duplicate fails, counting from 1
 */
function failDuplicate(lane: LiveLane, nth: number): void {
  const make = lane.track.methods.duplicate_clip_to_arrangement as Method;
  let made = 0;

  lane.track.methods.duplicate_clip_to_arrangement = (...args) => {
    if (++made === nth) {
      throw new Error("Live is unhappy");
    }

    return make(...args);
  };
}

/**
 * Make Live ignore the delete of one clip.
 * @param lane - The lane
 * @param id - The clip
 */
function keepClip(lane: LiveLane, id: string): void {
  const remove = lane.track.methods.delete_clip as Method;

  lane.track.methods.delete_clip = (source) =>
    source === `id ${id}` ? ["id", 0] : remove(source);
}

/**
 * Make Live throw when asked to delete one clip.
 * @param lane - The lane
 * @param id - The clip
 */
function refuseDeleting(lane: LiveLane, id: string): void {
  const remove = lane.track.methods.delete_clip as Method;

  lane.track.methods.delete_clip = (source) => {
    if (source === `id ${id}`) {
      throw new Error("Live is unhappy");
    }

    return remove(source);
  };
}

/**
 * The copies of the source and of its spare a lane was asked for, in order.
 * @param lane - The lane
 * @returns The clip copied and where its copy was put
 */
function copiesMade(lane: LiveLane): unknown[][] {
  return lane.track.call.mock.calls
    .filter(
      ([method, source]) =>
        method === "duplicate_clip_to_arrangement" &&
        (source === "id src" || source === "id copy-0-0"),
    )
    .map(([, source, beats]) => [source, beats]);
}

/**
 * Where a lane's clips sit.
 * @param lane - The lane
 * @returns Each clip's start and end, in beats
 */
function spans(lane: LiveLane): number[][] {
  return lane.clips().map(({ start, end }) => [start, end]);
}

afterEach(() => {
  vi.restoreAllMocks();
  updateClipMock.mockReset();
});

describe("duplicate - several copies onto the source clip itself", () => {
  it("makes each from a full copy of the source, so the later one is full", async () => {
    const lane = registerSourceOnTrack0();

    const result = await duplicate({
      type: "clip",
      id: "src",
      toPath: "t0[2|1],t0[3|1]",
    });

    // The source is cut to bar 1, the first copy to bar 2, and the second is
    // all four bars. The spare is gone.
    expect(spans(lane)).toStrictEqual([
      [0, 4],
      [4, 8],
      [8, 24],
    ]);
    expect(result).toStrictEqual([
      {
        id: "copy-0-2",
        path: "t0[2|1]",
        detail:
          "shortened the clip at t0[1|1]; shortened by t0[3|1] later in this call",
      },
      { id: "copy-0-4", path: "t0[3|1]" },
    ]);
  });

  it("keeps the spare until the third of three copies is made", async () => {
    const lane = registerSourceOnTrack0();

    const result = await duplicate({
      type: "clip",
      id: "src",
      toPath: "t0[2|1],t0[3|1],t0[4|1]",
    });

    expect(spans(lane)).toStrictEqual([
      [0, 4],
      [4, 8],
      [8, 12],
      [12, 28],
    ]);
    expect(result).toHaveLength(3);
    expect(copiesMade(lane)).toStrictEqual([
      ["id src", 128],
      ["id copy-0-0", 4],
      ["id copy-0-0", 8],
      ["id copy-0-0", 12],
    ]);

    const deletes = lane.track.call.mock.calls.filter(
      ([method, source]) =>
        method === "delete_clip" && source === "id copy-0-0",
    );

    expect(deletes).toHaveLength(1);
    expect(lane.track.call).toHaveBeenLastCalledWith(
      "delete_clip",
      "id copy-0-0",
    );
  });

  it("makes them in the order named, both from the spare", async () => {
    const lane = registerSourceOnTrack0();

    await duplicate({ type: "clip", id: "src", toPath: "t0[3|1],t0[2|1]" });

    expect(copiesMade(lane)).toStrictEqual([
      ["id src", 124],
      ["id copy-0-0", 8],
      ["id copy-0-0", 4],
    ]);
  });

  it("copies the whole source to a track in the same call", async () => {
    const lane = registerSourceOnTrack0();
    const other = registerLiveLane({ trackIndex: 1, copyBeats: 16 });

    await duplicate({
      type: "clip",
      id: "src",
      toPath: "t0[2|1],t1[1|1],t0[3|1]",
    });

    // The other track's copy comes first, from the untouched source.
    expect(spans(other)).toStrictEqual([[0, 16]]);
    expect(spans(lane)).toStrictEqual([
      [0, 4],
      [4, 8],
      [8, 24],
    ]);
  });

  it("reports neither the spare nor a clip made before it", async () => {
    const lane = registerSourceOnTrack0();

    // The copy at bar 10 is made first and is the lane's furthest clip; the
    // lane was already read when the spare joined it.
    const result = await duplicate({
      type: "clip",
      id: "src",
      toPath: "t0[2|1],t0[10|1],t0[3|1]",
    });

    expect(spans(lane)).toStrictEqual([
      [0, 4],
      [4, 8],
      [8, 24],
      [36, 52],
    ]);
    expect(result).toStrictEqual([
      expect.objectContaining({
        path: "t0[2|1]",
        detail:
          "shortened the clip at t0[1|1]; shortened by t0[3|1] later in this call",
      }),
      { id: expect.any(String), path: "t0[10|1]" },
      { id: expect.any(String), path: "t0[3|1]" },
    ]);
  });

  it("doesn't say a later copy overwrote the spare once it is deleted", async () => {
    const lane = registerLiveLane({
      trackIndex: 0,
      clips: [
        { id: "src", start: 0, end: 16 },
        { id: "other", start: 80, end: 84 },
      ],
      copiesSourceLength: true,
    });

    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });

    // The other source's copy comes after the spare is deleted, and lands
    // where it was.
    const result = await duplicate({
      type: "clip",
      id: "src,src,other",
      toPath: "t0[2|1],t0[3|1],t0[32|1]",
    });

    expect(result).toStrictEqual([
      expect.objectContaining({ path: "t0[2|1]" }),
      { id: expect.any(String), path: "t0[3|1]" },
      { id: expect.any(String), path: "t0[32|1]" },
    ]);
    expect(spans(lane)).toStrictEqual([
      [0, 4],
      [4, 8],
      [8, 24],
      [80, 84],
      [124, 128],
    ]);
  });

  it("keeps the spare past a copy as long as it was asked to be", async () => {
    const lane = registerSourceOnTrack0();

    await duplicate({
      type: "clip",
      id: "src",
      toPath: "t0[2|1],t0[3|1]",
    });

    // 124 is 100 past the furthest any copy reaches (beat 8 + 16).
    expect(lane.track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id src",
      124,
    );
    expect(lane.track.call).toHaveBeenLastCalledWith(
      "delete_clip",
      "id copy-0-0",
    );
  });

  it("needs no spare for a single copy on the source", async () => {
    const lane = registerSourceOnTrack0();

    await duplicate({ type: "clip", id: "src", toPath: "t0[2|1]" });

    expect(spans(lane)).toStrictEqual([
      [0, 4],
      [4, 20],
    ]);
    // The source is copied once, to the holding area the single copy always uses.
    expect(
      lane.track.call.mock.calls.filter(
        ([method, source]) =>
          method === "duplicate_clip_to_arrangement" && source === "id src",
      ),
    ).toHaveLength(1);
  });

  describe("when a copy goes wrong", () => {
    it("deletes the spare after a first copy Live refuses", async () => {
      const lane = registerSourceOnTrack0();

      failDuplicate(lane, 2);

      const result = await duplicate({
        type: "clip",
        id: "src",
        toPath: "t0[2|1],t0[3|1]",
      });

      expect(spans(lane)).toStrictEqual([
        [0, 4],
        [8, 24],
      ]);
      expect(result).toStrictEqual([
        {
          path: "t0[2|1]",
          detail:
            "Live is unhappy; shortened the clip at t0[1|1]; shortened by t0[3|1] later in this call",
        },
        { id: expect.any(String), path: "t0[3|1]" },
      ]);
    });

    it("deletes the spare after the last copy is refused", async () => {
      const lane = registerSourceOnTrack0();

      failDuplicate(lane, 3);

      const result = await duplicate({
        type: "clip",
        id: "src",
        toPath: "t0[2|1],t0[3|1]",
      });

      // The refused copy still cut the first one back to bar 3.
      expect(spans(lane)).toStrictEqual([
        [0, 4],
        [4, 8],
      ]);
      expect(result).toStrictEqual([
        {
          id: expect.any(String),
          path: "t0[2|1]",
          detail: "shortened the clip at t0[1|1]",
        },
        { path: "t0[3|1]", ok: false, detail: "Live is unhappy" },
      ]);
    });

    it("deletes the spare when the deadline stops the call", async () => {
      const lane = registerSourceOnTrack0();
      const make = lane.track.methods.duplicate_clip_to_arrangement as Method;
      let now = 0;

      vi.spyOn(Date, "now").mockImplementation(() => now);

      lane.track.methods.duplicate_clip_to_arrangement = (...args) => {
        now += 600;

        return make(...args);
      };

      const result = await duplicate(
        { type: "clip", id: "src", toPath: "t0[2|1],t0[3|1]" },
        { deadline: 1000 },
      );

      // The spare and the first copy used the time; the second never started.
      expect(spans(lane)).toStrictEqual([
        [0, 4],
        [4, 20],
      ]);
      expect(result).toStrictEqual([
        expect.objectContaining({ id: expect.any(String), path: "t0[2|1]" }),
        {
          path: "t0[3|1]",
          ok: false,
          detail: "the request ran out of time; re-run for this destination",
        },
      ]);
    });

    it("makes none of them when no spare can be made", async () => {
      const lane = registerSourceOnTrack0();

      failDuplicate(lane, 1);

      const result = await duplicate({
        type: "clip",
        id: "src",
        toPath: "t0[2|1],t0[3|1]",
      });

      const refused =
        "couldn't make a spare copy of the source clip to copy from: " +
        "Live is unhappy";

      expect(result).toStrictEqual([
        { path: "t0[2|1]", ok: false, detail: refused },
        { path: "t0[3|1]", ok: false, detail: refused },
      ]);
      expect(spans(lane)).toStrictEqual([[0, 16]]);
      // Asked once: the second copy does not try again.
      expect(
        lane.track.call.mock.calls.filter(
          ([method]) => method === "duplicate_clip_to_arrangement",
        ),
      ).toHaveLength(1);
    });
  });

  describe("when the spare cannot be deleted", () => {
    it("says on the last copy's entry where it is left", async () => {
      const lane = registerSourceOnTrack0();

      keepClip(lane, "copy-0-0");

      const result = await duplicate({
        type: "clip",
        id: "src",
        toPath: "t0[2|1],t0[3|1]",
      });

      expect(result).toStrictEqual([
        expect.objectContaining({ path: "t0[2|1]" }),
        {
          id: "copy-0-4",
          path: "t0[3|1]",
          detail:
            "a spare copy of the source clip is still at t0[32|1] (id copy-0-0); delete it",
        },
      ]);
    });

    it("says so when Live throws on the delete", async () => {
      const lane = registerSourceOnTrack0();

      refuseDeleting(lane, "copy-0-0");

      const result = await duplicate({
        type: "clip",
        id: "src",
        toPath: "t0[2|1],t0[3|1]",
      });

      expect(result).toStrictEqual([
        expect.objectContaining({ path: "t0[2|1]" }),
        {
          id: "copy-0-4",
          path: "t0[3|1]",
          detail:
            "a spare copy of the source clip is still at t0[32|1] (id copy-0-0); delete it",
        },
      ]);
    });

    it("says it on a last copy that was refused, with what already changed", async () => {
      const lane = registerSourceOnTrack0();

      keepClip(lane, "copy-0-0");
      failDuplicate(lane, 3);

      const result = await duplicate({
        type: "clip",
        id: "src",
        toPath: "t0[2|1],t0[3|1]",
      });

      expect(result).toStrictEqual([
        expect.objectContaining({ path: "t0[2|1]" }),
        {
          path: "t0[3|1]",
          detail:
            "Live is unhappy; already changed: a spare copy of the source clip is still at t0[32|1] (id copy-0-0); delete it",
        },
      ]);
    });

    it("says it on the first copy's entry when the deadline stops the call", async () => {
      const lane = registerSourceOnTrack0();
      const make = lane.track.methods.duplicate_clip_to_arrangement as Method;
      let now = 0;

      keepClip(lane, "copy-0-0");
      vi.spyOn(Date, "now").mockImplementation(() => now);

      lane.track.methods.duplicate_clip_to_arrangement = (...args) => {
        now += 600;

        return make(...args);
      };

      const result = (await duplicate(
        { type: "clip", id: "src", toPath: "t0[2|1],t0[3|1]" },
        { deadline: 1000 },
      )) as Array<{ detail?: string }>;

      expect(result[0]?.detail).toContain(
        "a spare copy of the source clip is still at t0[32|1] (id copy-0-0); delete it",
      );
      expect(result[1]?.detail).toBe(
        "the request ran out of time; re-run for this destination",
      );
    });
  });

  describe("with an arrangementLength", () => {
    it("lengthens a copy made from the spare", async () => {
      const lane = registerSourceOnTrack0();

      updateClipMock.mockImplementation(({ ids }: { ids: string }) => {
        const clip = lane.clips().find(({ id }) => id === ids);

        lane.grow(ids, (clip?.start ?? 0) + 24);

        return Promise.resolve([{ id: ids }]);
      });

      await duplicate({
        type: "clip",
        id: "src",
        toPath: "t0[2|1],t0[3|1]",
        arrangementLength: "4bar,6bar",
      });

      // The first copy keeps the source's length and is cut short by the second,
      // which is lengthened to six bars.
      expect(spans(lane)).toStrictEqual([
        [0, 4],
        [4, 8],
        [8, 32],
      ]);
      expect(copiesMade(lane)).toStrictEqual([
        ["id src", 132],
        ["id copy-0-0", 4],
        ["id copy-0-0", 8],
      ]);
      expect(lane.track.call).toHaveBeenLastCalledWith(
        "delete_clip",
        "id copy-0-0",
      );
    });

    it("shortens each copy made from the spare, and deletes the spare", async () => {
      const lane = registerSourceOnTrack0();

      const result = (await duplicate({
        type: "clip",
        id: "src",
        toPath: "t0[2|1],t0[3|1]",
        arrangementLength: "2bar",
      })) as Array<{ id?: string }>;

      // Each shortened copy is cut from the spare, never from the source.
      const shortened = lane.track.call.mock.calls.filter(
        ([method, source]) =>
          method === "duplicate_clip_to_arrangement" &&
          source === "id copy-0-0",
      );

      expect(shortened).toHaveLength(2);
      expect(result.map(({ id }) => id != null)).toStrictEqual([true, true]);
      expect(lane.track.call).toHaveBeenLastCalledWith(
        "delete_clip",
        "id copy-0-0",
      );
    });
  });
});
