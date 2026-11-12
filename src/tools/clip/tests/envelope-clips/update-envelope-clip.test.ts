// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip on a Live 13 return-track envelope clip: what lands, what is
// ignored and why, and that nothing reaches Live's note or sample APIs.

import { beforeEach, describe, expect, it } from "vitest";
import { type ClipUpdateArgs } from "#src/tools/clip/update/helpers/call/clip-update-args.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { registerRegularClip } from "./envelope-clip-test-helpers.ts";
import {
  noteOrAudioTouches,
  resetWritableEnvelopeWorld,
  type WritableEnvelopeWorld,
} from "./envelope-write-test-helpers.ts";

const IS_ENVELOPE = "the clip is an envelope clip";

type Entry = Record<string, unknown>;

/**
 * @param world - The mocks
 * @returns The properties written to the "No Envs" clip, in order
 */
function written(world: WritableEnvelopeWorld): string[] {
  return world.noEnvs.set.mock.calls.map(([prop]) => String(prop));
}

describe("update-clip - envelope clips", () => {
  let world: WritableEnvelopeWorld;

  beforeEach(() => {
    world = resetWritableEnvelopeWorld();
  });

  describe("params it takes", () => {
    it.each([
      ["path", { path: "rt0/s0" }],
      ["id", { ids: "no-envs" }],
    ])(
      "renames, recolors and loops a clip named by %s",
      async (_how, target) => {
        const result = (await updateClip({
          ...target,
          name: "Wide",
          color: "#FF0000",
          looping: true,
          start: "1|1",
          length: "1bar",
          timeSignature: "3/4",
        })) as unknown as Entry;

        expect(result).toStrictEqual(
          expect.objectContaining({ id: "no-envs", path: "rt0/s0" }),
        );
        expect(result).not.toHaveProperty("ok");
        expect(world.noEnvs.set).toHaveBeenCalledWith("name", "Wide");
        expect(world.noEnvs.set).toHaveBeenCalledWith("looping", true);
        expect(written(world)).toStrictEqual(
          expect.arrayContaining([
            "signature_numerator",
            "signature_denominator",
            "loop_start",
            "loop_end",
          ]),
        );
        expect(noteOrAudioTouches(world)).toStrictEqual([]);
      },
    );

    it("updates it beside a regular clip in one list", async () => {
      registerRegularClip();

      const result = (await updateClip({
        ids: "regular,no-envs",
        name: "A,B",
      })) as unknown as Entry[];

      expect(result).toStrictEqual([
        expect.objectContaining({ id: "regular", path: "t0/s0" }),
        expect.objectContaining({ id: "no-envs", path: "rt0/s0" }),
      ]);
      expect(world.noEnvs.set).toHaveBeenCalledWith("name", "B");
      expect(noteOrAudioTouches(world)).toStrictEqual([]);
    });
  });

  describe("params it ignores", () => {
    const base = { path: "rt0/s0", name: "Kept" };

    it.each<[string, ClipUpdateArgs]>([
      ["notes", { notes: "C3 1|1" }],
      ["transforms", { transforms: "velocity = 100" }],
      ["preTransforms", { preTransforms: "velocity = 100" }],
      ["quantize, quantizeGrid", { quantize: 1, quantizeGrid: "1/16" }],
      ["duplicateLoop", { duplicateLoop: true }],
      ["code", { code: "return notes" }],
      ["scale", { scale: "C Major" }],
      ["gainDb, pitchShift", { gainDb: 2, pitchShift: 1 }],
      ["warpMode, warping", { warpMode: "beats", warping: true }],
      ["warpOp, warpBeatTime", { warpOp: "add", warpBeatTime: 1 }],
      ["convert", { convert: "drums" }],
    ])("says %s did nothing and lands the rest", async (names, params) => {
      const result = (await updateClip({
        ...base,
        ...params,
      })) as unknown as Entry;

      expect(result.detail).toBe(`${names} ignored: ${IS_ENVELOPE}`);
      expect(world.noEnvs.set).toHaveBeenCalledWith("name", "Kept");
      expect(written(world)).toStrictEqual(["name"]);
      expect(noteOrAudioTouches(world)).toStrictEqual([]);
    });

    it("keeps envelopes out for now, with its own reason", async () => {
      const result = (await updateClip({
        ...base,
        envelopes: "pan: 1|1 0.5",
      })) as unknown as Entry;

      expect(result.detail).toBe(
        "envelopes ignored: return-track clips can't take envelopes yet",
      );
      expect(written(world)).toStrictEqual(["name"]);
    });

    it("says each one on its own when several are sent", async () => {
      const result = (await updateClip({
        ...base,
        notes: "C3 1|1",
        transforms: "velocity = 100",
        gainDb: 1,
      })) as unknown as Entry;

      expect(result.detail).toBe(
        [
          `notes ignored: ${IS_ENVELOPE}`,
          `transforms ignored: ${IS_ENVELOPE}`,
          `gainDb ignored: ${IS_ENVELOPE}`,
        ].join("; "),
      );
    });

    it("skips a clip that nothing landed on, in a list", async () => {
      registerRegularClip();

      const result = (await updateClip({
        ids: "regular,no-envs",
        notes: "C3 1|1",
      })) as unknown as Entry[];

      expect(result[1]).toStrictEqual({
        id: "no-envs",
        ok: false,
        detail: `notes ignored: ${IS_ENVELOPE}`,
      });
      expect(written(world)).toStrictEqual([]);
    });

    it("throws for a lone clip that nothing landed on", async () => {
      await expect(updateClip({ ids: "no-envs", gainDb: 2 })).rejects.toThrow(
        `gainDb ignored: ${IS_ENVELOPE}`,
      );
      expect(written(world)).toStrictEqual([]);
    });

    it("still refuses transforms that can't be read, whatever the clip", async () => {
      await expect(
        updateClip({ ...base, transforms: "velocity = " }),
      ).rejects.toThrow("transform syntax error");
      expect(written(world)).toStrictEqual([]);
    });

    it("never parses notes it will ignore", async () => {
      const result = (await updateClip({
        ...base,
        notes: "this is not notation",
      })) as unknown as Entry;

      expect(result.detail).toBe(`notes ignored: ${IS_ENVELOPE}`);
      expect(world.noEnvs.set).toHaveBeenCalledWith("name", "Kept");
    });
  });

  describe("a write that throws after another landed", () => {
    it("reports what landed on the clip's entry", async () => {
      world.noEnvs.set.mockImplementation((prop: unknown) => {
        if (prop === "color") {
          throw new Error("Live refused the color");
        }
      });

      const result = (await updateClip({
        ids: "no-envs,with-env",
        name: "Renamed",
        color: "#00FF00",
      })) as unknown as Entry[];

      expect(result[0]).toStrictEqual(
        expect.objectContaining({ id: "no-envs", path: "rt0/s0" }),
      );
      expect(result[0]?.detail).toContain("Live refused the color");
      expect(result[0]?.detail).toContain("name");
      expect(result[0]).not.toHaveProperty("ok", false);
      expect(world.noEnvs.set).toHaveBeenCalledWith("name", "Renamed");
      expect(result[1]).toStrictEqual(
        expect.objectContaining({ id: "with-env", path: "rt1/s0" }),
      );
    });
  });
});
