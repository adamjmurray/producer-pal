// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import {
  expectTakeLaneMidiClip,
  registerTakeLaneTrack,
} from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

describe("createClip take lanes - a constant that depends on the meter", () => {
  // 1bar - 4 is no copies in 4/4 and 2 in 6/4.
  it("makes no lane for the position whose meter fails, and one for the other", async () => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });

    const failing = registerTakeLaneTrack({ trackIndex: 0, initialLanes: 0 });
    const working = registerTakeLaneTrack({ trackIndex: 1, initialLanes: 0 });

    const result = (await createClip({
      path: "t0/l0[1|1],t1/l0[1|1]",
      timeSignature: "4/4,6/4",
      notes: "C3 1|1",
      transforms: "repeat(n/8, 1bar - 4)",
    })) as object[];

    expect(result[0]).toStrictEqual({
      path: "t0/l0[1|1]",
      ok: false,
      detail: "repeat() needs a copy count of 1 or more",
    });
    expect(result[1]).not.toHaveProperty("ok");
    expect(failing.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(working.call).toHaveBeenCalledWith("create_take_lane");
    expectTakeLaneMidiClip(0, 0, 6, 1);
  });
});
