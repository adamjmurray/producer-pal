// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClip } from "../../create-clip.ts";
import { twoSessionSlots } from "../notes/session-slot-test-helpers.ts";
import {
  registerArrangementTrack,
  registerLiveSetInFourFour,
} from "../create-clip-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  maxError: vi.fn(),
  maxLog: vi.fn(),
  emitWarning: vi.fn(),
}));

const PAST_END =
  'start "3|1" is not before the clip\'s end at 2|1: send a length too, or an earlier start';

describe("createClip - a start at or past the clip's end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses it in the arrangement before touching Live", async () => {
    registerLiveSetInFourFour();
    const track = registerArrangementTrack(0);

    await expect(
      createClip({ path: "t0[3|1]", start: "3|1", notes: "C3 1|1" }),
    ).rejects.toThrow(PAST_END);
    expect(track.call).not.toHaveBeenCalled();
  });

  it("refuses it in the session before touching Live", async () => {
    const [first] = twoSessionSlots();

    await expect(
      createClip({ path: "t0/s0", start: "3|1", notes: "C3 1|1" }),
    ).rejects.toThrow(PAST_END);
    expect(first.clipSlot.call).not.toHaveBeenCalled();
  });

  it("refuses a start exactly at the end", async () => {
    const [first] = twoSessionSlots();

    await expect(
      createClip({ path: "t0/s0", start: "2|1", notes: "C3 1|1" }),
    ).rejects.toThrow('start "2|1" is not before the clip\'s end at 2|1');
    expect(first.clipSlot.call).not.toHaveBeenCalled();
  });

  it("refuses it on an empty clip, which is one bar long", async () => {
    const [first] = twoSessionSlots();

    await expect(createClip({ path: "t0/s0", start: "3|1" })).rejects.toThrow(
      PAST_END,
    );
    expect(first.clipSlot.call).not.toHaveBeenCalled();
  });

  it("fails only the position whose start is past the end", async () => {
    const [first, second] = twoSessionSlots();

    const result = (await createClip({
      path: "t0/s0,t0/s1",
      start: "3|1,1|1",
      notes: "C3 1|1",
    })) as object[];

    expect(result[0]).toStrictEqual({
      path: "t0/s0",
      ok: false,
      detail: PAST_END,
    });
    expect(result[1]).not.toHaveProperty("ok");
    expect(first.clipSlot.call).not.toHaveBeenCalled();
    expect(second.clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
  });

  it("takes the start when a length is sent with it", async () => {
    const [first] = twoSessionSlots();

    const result = await createClip({
      path: "t0/s0",
      start: "3|1",
      length: "1bar",
      notes: "C3 3|1",
    });

    expect(result).not.toHaveProperty("ok");
    expect(first.clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
  });

  // The transform moves the only note to bar 3, so the clip ends at 4|1.
  it("measures the end after the transform has run", async () => {
    const [first] = twoSessionSlots();

    const result = await createClip({
      path: "t0/s0",
      start: "3|1",
      notes: "C3 1|1",
      transforms: "timing += 2bar",
    });

    expect(result).not.toHaveProperty("ok");
    expect(first.clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
  });
});
