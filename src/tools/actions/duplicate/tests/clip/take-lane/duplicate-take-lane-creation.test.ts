// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Making the lanes a copy needs can stop partway: the lanes already made stay,
// and the entry says so.

import { describe, expect, it } from "vitest";
import "../../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerArrangementSource,
  registerLiveSet,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

describe("duplicate - take lanes made on the way to a copy", () => {
  it("says which lanes were made when Live stops before the one asked for", async () => {
    registerLiveSet();
    registerArrangementSource(true);

    const track = registerTakeLaneTrack({ initialLanes: 0 });
    const create = track.methods.create_take_lane as () => unknown;
    let made = 0;

    // The first lane is made, and the second is where Live gives up.
    track.methods.create_take_lane = () => {
      if (made++ > 0) {
        throw new Error("Live is unhappy");
      }

      return create();
    };

    const result = await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t0/l1[1|1]",
    });

    expect(result).toStrictEqual({
      path: "t0/l1[1|1]",
      detail: "Live is unhappy; already changed: take lanes made on t0",
    });
  });

  it("keeps no trace of a lane Live never made", async () => {
    registerLiveSet();
    registerArrangementSource(true);

    registerTakeLaneTrack({ initialLanes: 0 }).methods.create_take_lane =
      () => {
        throw new Error("Live is unhappy");
      };

    await expect(
      duplicate({ type: "clip", id: "src_clip", toPath: "t0/l0[1|1]" }),
    ).rejects.toThrow(/^Live is unhappy$/);
  });
});
