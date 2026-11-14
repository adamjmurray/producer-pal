// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createClip } from "../../create-clip.ts";
import { buildClipPlans } from "../../helpers/clip-plans.ts";
import { twoSessionSlots } from "../notes/session-slot-test-helpers.ts";
import { registerArrangementTrack } from "../create-clip-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  maxError: vi.fn(),
  maxLog: vi.fn(),
  emitWarning: vi.fn(),
}));

const EMPTY = 'length "0bar" must be longer than zero';

describe("createClip - a length that spans nothing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses it in the arrangement before touching Live", async () => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    const track = registerArrangementTrack(0);

    await expect(
      createClip({ path: "t0[1|1]", length: "0bar", notes: "C3 1|1" }),
    ).rejects.toThrow(EMPTY);
    expect(track.call).not.toHaveBeenCalled();
  });

  it("refuses it in the session before touching Live", async () => {
    const [first] = twoSessionSlots();

    await expect(
      createClip({ path: "t0/s0", length: "0bar", notes: "C3 1|1" }),
    ).rejects.toThrow(EMPTY);
    expect(first.clipSlot.call).not.toHaveBeenCalled();
  });

  it("refuses the whole call when one entry of a list is empty", async () => {
    const [first, second] = twoSessionSlots();

    await expect(
      createClip({
        path: "t0/s0,t0/s1",
        length: "2bar,n0/4",
        notes: "C3 1|1",
      }),
    ).rejects.toThrow('length "n0/4" must be longer than zero');
    expect(first.clipSlot.call).not.toHaveBeenCalled();
    expect(second.clipSlot.call).not.toHaveBeenCalled();
  });

  it("ignores the length of an audio clip, which takes the sample's", () => {
    const plans = buildClipPlans({
      count: 1,
      song: { songTimeSigNumerator: 4, songTimeSigDenominator: 4 },
      sampleFile: "/samples/loop.wav",
      timeSignature: null,
      start: null,
      length: "0bar",
      firstStart: null,
      notationString: null,
      transformString: null,
      notation: undefined,
    });

    expect(plans[0]).not.toHaveProperty("failure");
  });

  // 1bar-n/1 is nothing in 4/4 and 2 beats in 6/4
  it("fails only the position whose meter makes it empty", async () => {
    const [first, second] = twoSessionSlots();

    const result = (await createClip({
      path: "t0/s0,t0/s1",
      timeSignature: "4/4,6/4",
      length: "1bar-n/1",
      notes: "C3 1|1",
    })) as object[];

    expect(result[0]).toStrictEqual({
      path: "t0/s0",
      ok: false,
      detail: 'length "1bar-n/1" must be longer than zero',
    });
    expect(result[1]).not.toHaveProperty("ok");
    expect(first.clipSlot.call).not.toHaveBeenCalled();
    expect(second.clipSlot.call).toHaveBeenCalledWith("create_clip", 2);
  });

  it("fails only the arrangement position whose meter makes it empty", async () => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    const track = registerArrangementTrack(0);

    const result = (await createClip({
      path: "t0[1|1],t0[3|1]",
      timeSignature: "4/4,6/4",
      length: "1bar-n/1",
      notes: "C3 1|1",
    })) as object[];

    expect(result[0]).toStrictEqual({
      path: "t0[1|1]",
      ok: false,
      detail: 'length "1bar-n/1" must be longer than zero',
    });
    expect(result[1]).not.toHaveProperty("ok");
    expect(track.call).toHaveBeenCalledTimes(1);
  });

  // The length is the plainer fault, so it is what the entry says.
  it("says the length when the same clip's transform can't be read either", async () => {
    const [first, second] = twoSessionSlots();

    const result = (await createClip({
      path: "t0/s0,t0/s1",
      timeSignature: "4/4,6/4",
      length: "1bar-n/1",
      notes: "C3 1|1",
      transforms: "repeat(n/8, 1bar - 4)",
    })) as object[];

    expect(result[0]).toStrictEqual({
      path: "t0/s0",
      ok: false,
      detail: 'length "1bar-n/1" must be longer than zero',
    });
    expect(first.clipSlot.call).not.toHaveBeenCalled();
    expect(second.clipSlot.call).toHaveBeenCalledWith("create_clip", 2);
  });
});
