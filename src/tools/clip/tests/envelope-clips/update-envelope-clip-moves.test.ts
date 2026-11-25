// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip moving an envelope clip: only to a return track's slot, by Live's
// own copy and then deleting the original.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  clipSlotReadsOnReturns,
  registerRegularClip,
} from "./envelope-clip-test-helpers.ts";
import {
  answerEnvelopeList,
  noteOrAudioTouches,
  PREDELAY_ENVELOPE,
  resetWritableEnvelopeWorld,
  type WritableEnvelopeWorld,
} from "./envelope-write-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const ONLY_RETURN = "an envelope clip can only go to a return-track slot";
const ONLY_ENVELOPE = "a return-track slot only takes an envelope clip";

type Entry = Record<string, unknown>;

/**
 * @param world - The mocks
 * @param returnIndex - The return track
 * @param scene - The scene
 * @returns The calls the slot got
 */
function slotCalls(
  world: WritableEnvelopeWorld,
  returnIndex: number,
  scene: number,
): string[] {
  return (world.slots[returnIndex]?.[scene]?.call.mock.calls ?? []).map(
    ([method, ...args]) => [method, ...args].join(" "),
  );
}

describe("update-clip - moving an envelope clip", () => {
  let world: WritableEnvelopeWorld;

  beforeEach(() => {
    world = resetWritableEnvelopeWorld();
    answerEnvelopeList([PREDELAY_ENVELOPE]);
  });

  it.each([
    ["path", { path: "rt0/s0" }],
    ["id", { ids: "no-envs" }],
  ])(
    "moves a clip named by %s to another slot of its track",
    async (_how, target) => {
      const result = (await updateClip({
        ...target,
        toPath: "rt0/s2",
      })) as unknown as Entry;

      expect(result).toStrictEqual({ id: "copy-1", path: "rt0/s2" });
      expect(slotCalls(world, 0, 0)).toStrictEqual([
        "duplicate_clip_to id r0s2",
        "delete_clip",
      ]);
      expect(world.copies.get("rt0/s2")?.properties.name).toBe("No Envs");
      expect(noteOrAudioTouches(world)).toStrictEqual([]);
    },
  );

  it("moves a clip to a slot of another return track, with its other edits", async () => {
    const result = (await updateClip({
      ids: "with-env",
      toPath: "rt0/s1",
      name: "Moved",
    })) as unknown as Entry;

    expect(result).toStrictEqual({
      id: "copy-1",
      path: "rt0/s1",
      detail:
        "dropped the device envelopes, which don't copy to another track: Predelay (rt1/d0)",
    });
    expect(world.withEnv.set).toHaveBeenCalledWith("name", "Moved");
    expect(slotCalls(world, 1, 0)).toContain("delete_clip");
  });

  it("doesn't look for envelopes when the clip stays on its return track", async () => {
    await updateClip({ ids: "with-env", toPath: "rt1/s1" });

    expect(vi.mocked(requestNode)).not.toHaveBeenCalled();
  });

  it("says when the move replaced the clip in the destination", async () => {
    const result = (await updateClip({
      ids: "no-envs",
      toPath: "rt1/s0",
    })) as unknown as Entry;

    expect(result).toStrictEqual(
      expect.objectContaining({ id: "copy-1", path: "rt1/s0" }),
    );
    expect(result.detail).toContain("rt1/s0");
    expect(result.detail).toContain("overwrote");
  });

  it("leaves a clip sent to its own slot where it is", async () => {
    const result = (await updateClip({
      ids: "no-envs",
      toPath: "rt0/s0",
      name: "Same",
    })) as unknown as Entry;

    expect(result).toStrictEqual(
      expect.objectContaining({ id: "no-envs", path: "rt0/s0" }),
    );
    expect(slotCalls(world, 0, 0)).toStrictEqual([]);
    expect(world.noEnvs.set).toHaveBeenCalledWith("name", "Same");
  });

  describe("destinations an envelope clip can't go to", () => {
    it.each([
      ["a regular slot", "t0/s2"],
      ["a regular track's arrangement", "t0[5|1]"],
      ["a take lane", "t0/l0[5|1]"],
    ])("skips the clip sent to %s", async (_where, toPath) => {
      await expect(updateClip({ ids: "no-envs", toPath })).rejects.toThrow(
        `not moved: ${ONLY_RETURN}`,
      );
      expect(slotCalls(world, 0, 0)).toStrictEqual([]);
    });

    it("gives the reason once when a position goes with the lane", async () => {
      await expect(
        updateClip({ ids: "no-envs", toPath: "t0[5|1]" }),
      ).rejects.toThrow(
        /^not moved: an envelope clip can only go to a return-track slot$/,
      );
    });

    it("moves the update's other params on, and says the move didn't happen", async () => {
      const result = (await updateClip({
        ids: "no-envs",
        toPath: "t0/s2",
        name: "Stays",
      })) as unknown as Entry;

      expect(result).toStrictEqual(
        expect.objectContaining({ id: "no-envs", path: "rt0/s0" }),
      );
      expect(result.detail).toBe(`not moved: ${ONLY_RETURN}`);
      expect(world.noEnvs.set).toHaveBeenCalledWith("name", "Stays");
    });

    it("skips a regular clip sent to a return-track slot, and moves the envelope clip beside it", async () => {
      registerRegularClip();

      const result = (await updateClip({
        ids: "regular,no-envs",
        toPath: "rt1/s2,rt0/s2",
      })) as unknown as Entry[];

      expect(result).toStrictEqual([
        { id: "regular", ok: false, detail: `not moved: ${ONLY_ENVELOPE}` },
        { id: "copy-1", path: "rt0/s2" },
      ]);
    });

    it("skips a move onto a clip the call also updates", async () => {
      const result = (await updateClip({
        ids: "no-envs,with-env",
        name: "A,B",
        toPath: "rt1/s0,rt1/s2",
      })) as unknown as Entry[];

      expect(result[0]).toStrictEqual({
        id: "no-envs",
        path: "rt0/s0",
        detail: expect.stringContaining("rt1/s0 holds clip"),
      });
      expect(result[1]).toStrictEqual({ id: "copy-1", path: "rt1/s2" });
    });

    it("skips a lone regular clip sent to a return-track slot", async () => {
      registerRegularClip();

      await expect(
        updateClip({ ids: "regular", toPath: "rt0/s2" }),
      ).rejects.toThrow(`not moved: ${ONLY_ENVELOPE}`);
      expect(slotCalls(world, 0, 2)).toStrictEqual([]);
    });
  });

  describe("arrangement params beside a return slot", () => {
    const SESSION = "this is a session clip";
    const OFF_TIMELINE =
      "toPath ignored: a clip slot is off the arrangement timeline the other position params name";

    it("says a return slot is off the timeline arrangementStart names, and doesn't move", async () => {
      await expect(
        updateClip({
          ids: "no-envs",
          toPath: "rt0/s2",
          arrangementStart: "5|1",
        }),
      ).rejects.toThrow(
        `${OFF_TIMELINE}; arrangementStart ignored: ${SESSION}`,
      );
      expect(slotCalls(world, 0, 0)).toStrictEqual([]);
    });

    it("says the same for arrangementLength, beside a param that lands", async () => {
      const result = (await updateClip({
        ids: "no-envs",
        name: "X",
        toPath: "rt0/s2",
        arrangementLength: "2bar",
      })) as unknown as Entry;

      expect(result).toStrictEqual({
        id: "no-envs",
        path: "rt0/s0",
        detail: `${OFF_TIMELINE}; arrangementLength ignored: ${SESSION}`,
      });
      expect(slotCalls(world, 0, 0)).toStrictEqual([]);
    });

    it.each([
      ["arrangementStart", { arrangementStart: "5|1" }],
      ["arrangementLength", { arrangementLength: "2bar" }],
      [
        "arrangementStart, arrangementLength",
        { arrangementStart: "5|1", arrangementLength: "2bar" },
      ],
    ])("says why %s did nothing with no toPath", async (names, params) => {
      await expect(updateClip({ ids: "no-envs", ...params })).rejects.toThrow(
        names
          .split(", ")
          .map((name) => `${name} ignored: ${SESSION}`)
          .join("; "),
      );
    });
  });

  describe("a move that can't finish", () => {
    it("skips a destination on a return track that isn't there", async () => {
      await expect(
        updateClip({ ids: "no-envs", toPath: "rt9/s0" }),
      ).rejects.toThrow("not moved: destination rt9/s0 does not exist");
      expect(slotCalls(world, 0, 0)).toStrictEqual([]);
    });

    it("keeps the original when Live makes no copy", async () => {
      const source = world.slots[0]?.[0];

      if (source != null) {
        source.methods.duplicate_clip_to = () => null;
      }

      await expect(
        updateClip({ ids: "no-envs", toPath: "rt0/s2" }),
      ).rejects.toThrow("no clip landed at rt0/s2, so the original was kept");
      expect(slotCalls(world, 0, 0)).not.toContain("delete_clip");
    });

    it("reports the copy when deleting the original fails", async () => {
      world.failDeletes();

      const result = (await updateClip({
        ids: "no-envs",
        toPath: "rt0/s2",
      })) as unknown as Entry;

      expect(result).toStrictEqual(
        expect.objectContaining({ id: "copy-1", path: "rt0/s2" }),
      );
      expect(result.detail).toContain(
        "the original at rt0/s0 could not be deleted",
      );
      expect(result.detail).toContain("Live refused to delete");
    });

    it("reports what landed when a write after the copy throws", async () => {
      world.noEnvs.set.mockImplementation(() => {
        throw new Error("Live refused the name");
      });

      const result = (await updateClip({
        ids: "no-envs,with-env",
        name: "X",
        toPath: "rt0/s2,rt1/s2",
      })) as unknown as Entry[];

      expect(result[0]?.detail).toContain("Live refused the name");
      expect(result[1]).toStrictEqual(
        expect.objectContaining({ path: "rt1/s2" }),
      );
    });
  });

  it("refuses a return-track slot on Live 12, saying so", async () => {
    world = resetWritableEnvelopeWorld("12.4.15");
    registerRegularClip();

    await expect(
      updateClip({ ids: "regular", toPath: "rt0/s1" }),
    ).rejects.toThrow("return-track clips need Live 13");
    expect(clipSlotReadsOnReturns(world)).toStrictEqual([]);
  });
});
