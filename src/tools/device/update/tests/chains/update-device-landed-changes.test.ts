// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A throw after a change already landed keeps the target's entry and names the
// change. Every kind of write has to count, not only the first one a
// target makes.

import { describe, expect, it } from "vitest";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  livePath,
  registerMacroRack,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import {
  KICK,
  registerUnbuiltPadChain,
} from "../params/pad-sample/pad-sample-fixtures.ts";

const REFUSED = "Live said no";
const MAX_REACHED = "The maximum number of macro controls is already reached!";

/**
 * Register a rack on t0/d0 that refuses to add macros.
 * @param addMacro - What `add_macro` does
 */
function registerRack(addMacro: () => null): void {
  registerMockObject("r1", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: {
      can_have_chains: 1,
      can_compare_ab: 1,
      visible_macro_count: 4,
      has_macro_mappings: 0,
    },
    methods: { add_macro: addMacro },
  });
}

describe("updateDevice - a throw after a change landed", () => {
  it("names an A/B compare switch that landed before a macroCount failed", () => {
    registerRack(() => {
      throw new Error(REFUSED);
    });

    expect(
      updateDevice({ id: "r1", abCompare: "b", macroCount: 8 }),
    ).toStrictEqual({
      id: "r1",
      path: "t0/d0",
      detail: `${REFUSED}; already changed: abCompare`,
    });
    expect(lookupMockObject("r1")?.set).toHaveBeenCalledWith(
      "is_using_compare_preset_b",
      1,
    );
  });

  it("says where the count landed when a macro add fails after others landed", () => {
    registerMacroRack("r1", { count: 4, steps: [4, 6] });

    expect(updateDevice({ id: "r1", macroCount: 8 })).toStrictEqual({
      id: "r1",
      path: "t0/d0",
      detail: `macroCount landed at 6, not 8; Live said: ${MAX_REACHED}`,
    });
  });

  it("names a pad chain made before a later write failed", () => {
    registerUnbuiltPadChain();
    lookupMockObject("pad-36")?.set.mockImplementation(() => {
      throw new Error(REFUSED);
    });

    expect(
      updateDevice({
        path: "t0/d0/pC1",
        mute: true,
        params: [{ name: "sample", value: KICK }],
      }),
    ).toStrictEqual({
      id: "pad-36",
      path: "t0/d0/pC1",
      detail: `${REFUSED}; already changed: pad chain made`,
    });
  });
});
