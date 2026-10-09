// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createClip } from "../../create-clip.ts";
import { twoSessionSlots } from "./session-slot-test-helpers.ts";

// A bar is 4 beats in 4/4 and 6 in 6/4, so this has no copies in 4/4 only.
const METER_DEPENDENT = "repeat(n/8, 1bar - 4)";

describe("createClip - a constant that depends on the meter", () => {
  it("fails only the position whose meter makes it bad", async () => {
    const [first, second] = twoSessionSlots();

    const result = (await createClip({
      path: "t0/s0,t0/s1",
      timeSignature: "4/4,6/4",
      notes: "C3 1|1",
      transforms: METER_DEPENDENT,
    })) as object[];

    expect(result[0]).toStrictEqual({
      path: "t0/s0",
      ok: false,
      detail: "repeat() needs a copy count of 1 or more",
    });
    expect(result[1]).not.toHaveProperty("ok");
    expect(first.clipSlot.call).not.toHaveBeenCalled();
    expect(second.clipSlot.call).toHaveBeenCalledWith(
      "create_clip",
      expect.anything(),
    );
  });

  // Refused whole: every meter fails it, or it holds in every meter.
  it.each([
    ["every position's meter makes it bad", "4/4,3/4", METER_DEPENDENT],
    ["it holds in every meter", "4/4,6/4", "repeat(n/8, 0)"],
  ])("refuses the call when %s", async (_label, timeSignature, transforms) => {
    const [first] = twoSessionSlots();

    await expect(
      createClip({
        path: "t0/s0,t0/s1",
        timeSignature,
        notes: "C3 1|1",
        transforms,
      }),
    ).rejects.toThrow("repeat() needs a copy count of 1 or more");
    expect(first.clipSlot.call).not.toHaveBeenCalled();
  });

  // 1|5 is the next bar's downbeat in 4/4, so the range is a point there; in
  // 3/4 it lands past 2|1 and the range runs backwards.
  it("fails only the position whose meter can't read a bar|beat range", async () => {
    const [first, second] = twoSessionSlots();

    const result = (await createClip({
      path: "t0/s0,t0/s1",
      timeSignature: "4/4,3/4",
      notes: "C3 1|1",
      transforms: "1|5-2|1: velocity = 1",
    })) as object[];

    expect(result[0]).not.toHaveProperty("ok");
    expect(result[1]).toStrictEqual({
      path: "t0/s1",
      ok: false,
      detail: expect.stringContaining("Invalid time range"),
    });
    expect(first.clipSlot.call).toHaveBeenCalledWith(
      "create_clip",
      expect.anything(),
    );
    expect(second.clipSlot.call).not.toHaveBeenCalled();
  });
});
