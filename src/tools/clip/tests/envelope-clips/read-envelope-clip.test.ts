// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import {
  clipSlotReadsOnReturns,
  registerEnvelopeWorld,
} from "./envelope-clip-test-helpers.ts";

describe("read-clip - Live 13 envelope clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("reads an envelope clip by path, with its own type and timing in beats", async () => {
    registerEnvelopeWorld();

    const result = await readClip({ path: "rt0/s0", include: ["*"] });

    expect(result).toStrictEqual({
      id: "no-envs",
      type: "envelope",
      name: "No Envs",
      color: "#FF0000",
      path: "rt0/s0",
      timeSignature: "4/4",
      looping: false,
      start: "1|1",
      end: "2|1",
      length: "1bar",
    });
  });

  it("reads the same clip by id, with the path of its slot", async () => {
    registerEnvelopeWorld();

    const result = await readClip({ id: "with-env" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        id: "with-env",
        type: "envelope",
        name: "With Env",
        path: "rt1/s0",
        envs: true,
      }),
    );
  });

  it("gives an envelope clip no sample, warp, notes or scale fields", async () => {
    registerEnvelopeWorld();

    const result = (await readClip({
      path: "rt1/s0",
      include: ["*"],
    })) as unknown as Record<string, unknown>;

    for (const field of [
      "gainDb",
      "pitchShift",
      "warping",
      "warpMode",
      "sampleFile",
      "sampleLength",
      "notes",
      "mutedNotes",
      "scale",
    ]) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it("says plainly that its envelopes can't be read yet", async () => {
    registerEnvelopeWorld();

    const result = await readClip({
      path: "rt1/s0",
      include: ["envelopes"],
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: "envelopes on return-track clips can't be read yet",
      }),
    );
  });

  it("answers an empty return slot like an empty regular one", async () => {
    registerEnvelopeWorld();

    await expect(readClip({ path: "rt0/s1" })).rejects.toThrow(
      "no clip at rt0/s1",
    );
  });

  it("names what is missing when the return track or scene isn't there", async () => {
    registerEnvelopeWorld();

    await expect(readClip({ path: "rt5/s0" })).rejects.toThrow(
      'no track at "rt5"',
    );
    await expect(readClip({ path: "rt0/s9" })).rejects.toThrow(
      'no scene at "s9"',
    );
  });

  it("reads one entry per clip in a list, return clips included", async () => {
    registerEnvelopeWorld();

    const result = await readClip({ path: "rt0/s0,rt1/s0" });

    expect(result).toStrictEqual([
      expect.objectContaining({ id: "no-envs", path: "rt0/s0" }),
      expect.objectContaining({ id: "with-env", path: "rt1/s0" }),
    ]);
  });

  describe("on Live 12", () => {
    it("refuses a return slot path, and never asks a return track for slots", async () => {
      const world = registerEnvelopeWorld("12.4.15");

      await expect(readClip({ path: "rt0/s0" })).rejects.toThrow(
        "return-track clips need Live 13",
      );
      expect(clipSlotReadsOnReturns(world)).toStrictEqual([]);
    });

    it("keeps a missing return slot out of a list as that entry's skip", async () => {
      registerEnvelopeWorld("12.4.15");

      const result = await readClip({ path: "rt0/s0,t0/s0" });

      expect(result).toStrictEqual([
        expect.objectContaining({
          ok: false,
          detail: "return-track clips need Live 13",
        }),
        expect.anything(),
      ]);
    });
  });
});
