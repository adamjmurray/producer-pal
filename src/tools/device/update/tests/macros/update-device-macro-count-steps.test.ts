// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live steps a rack's macro count its own way: by 2 up to 16 in Live 12,
// unevenly up to 32 in Live 13. macroCount adds or removes one step at a time
// and reads the count after each, until it reaches or passes the target.

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "../../update-device.ts";
import { registerMacroRack } from "../update-device-test-helpers.ts";

const MAX_REACHED = "The maximum number of macro controls is already reached!";

/** The counts Live 13 visits: add 8, 10, 12, 14, 32; remove 32, 14, 12, ... */
const LIVE_13_STEPS = [1, 2, 4, 6, 8, 10, 12, 14, 32];

describe("updateDevice macroCount on a Live 13 rack", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it.each([8, 2])("lowers to 1 from %i with nothing to report", (from) => {
    const rack = registerMacroRack("rack", {
      count: from,
      steps: LIVE_13_STEPS,
      macros: 32,
    });

    expect(updateDevice({ id: "rack", macroCount: 1 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
    });
    expect(rack.call).toHaveBeenCalledTimes(from === 8 ? 4 : 1);
  });

  it("leaves a rack already at 1 alone", () => {
    const rack = registerMacroRack("rack", {
      count: 1,
      steps: LIVE_13_STEPS,
      macros: 32,
    });

    expect(updateDevice({ id: "rack", macroCount: 1 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
    });
    expect(rack.call).not.toHaveBeenCalled();
  });

  it("still rounds 3 up to 4, and says so", () => {
    registerMacroRack("rack", { count: 8, steps: LIVE_13_STEPS, macros: 32 });

    expect(updateDevice({ id: "rack", macroCount: 3 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail: "macroCount rounded from 3 to 4 (macros come in pairs)",
    });
  });

  it("lands on a count Live steps to without comment", () => {
    const rack = registerMacroRack("rack", {
      count: 8,
      steps: LIVE_13_STEPS,
      macros: 32,
    });

    expect(updateDevice({ id: "rack", macroCount: 14 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
    });
    expect(rack.call).toHaveBeenCalledTimes(3);
  });

  it("goes up to 32", () => {
    registerMacroRack("rack", { count: 8, steps: LIVE_13_STEPS, macros: 32 });

    expect(updateDevice({ id: "rack", macroCount: 32 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
    });
  });

  it("lands just past 16 going down, and says so", () => {
    const rack = registerMacroRack("rack", {
      count: 32,
      steps: LIVE_13_STEPS,
      macros: 32,
    });

    expect(updateDevice({ id: "rack", macroCount: 16 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail: "macroCount landed at 14, not 16",
    });
    expect(rack.call).toHaveBeenCalledTimes(1);
    expect(rack.call).toHaveBeenCalledWith("remove_macro");
  });

  it("lands just past 16 going up, and says so", () => {
    const rack = registerMacroRack("rack", {
      count: 8,
      steps: LIVE_13_STEPS,
      macros: 32,
    });

    expect(updateDevice({ id: "rack", macroCount: 16 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail: "macroCount landed at 32, not 16",
    });
    expect(rack.call).toHaveBeenCalledTimes(4);
    expect(rack.call).toHaveBeenCalledWith("add_macro");
  });

  it("rounds an odd count up to the next even one before stepping", () => {
    registerMacroRack("rack", { count: 14, steps: LIVE_13_STEPS, macros: 32 });

    expect(updateDevice({ id: "rack", macroCount: 31 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail: "macroCount rounded from 31 to 32 (macros come in pairs)",
    });
  });

  it("says where the count landed when Live throws after it moved", () => {
    // Live throws at its maximum, here 14.
    registerMacroRack("rack", { count: 8, steps: [8, 10, 12, 14], macros: 32 });

    expect(updateDevice({ id: "rack", macroCount: 32 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail: `macroCount landed at 14, not 32; Live said: ${MAX_REACHED}`,
    });
  });

  it("says where the count landed when Live throws on the way down to 1", () => {
    const properties = { can_have_chains: 1, visible_macro_count: 4 };

    registerMockObject("rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties,
      methods: {
        remove_macro: () => {
          // The first remove lands on 2; the next throws.
          if (properties.visible_macro_count === 2) {
            throw new Error("remove failed");
          }

          properties.visible_macro_count = 2;

          return null;
        },
      },
    });

    expect(updateDevice({ id: "rack", macroCount: 1 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail: "macroCount landed at 2, not 1; Live said: remove failed",
    });
  });

  it("throws as Live did when it throws before the count moved", () => {
    registerMacroRack("rack", {
      count: 14,
      steps: [8, 10, 12, 14],
      macros: 32,
    });

    expect(() => updateDevice({ id: "rack", macroCount: 32 })).toThrow(
      MAX_REACHED,
    );
  });

  it("refuses a count above the rack's macros and names the most", () => {
    const rack = registerMacroRack("rack", {
      count: 8,
      steps: LIVE_13_STEPS,
      macros: 32,
    });

    expect(() => updateDevice({ id: "rack", macroCount: 34 })).toThrow(
      "macroCount 34 is above the most this rack has (32)",
    );
    expect(rack.call).not.toHaveBeenCalled();
  });
});

describe("updateDevice macroCount on a Live 12 rack", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("steps by 2 up to 16", () => {
    const rack = registerMacroRack("rack", { count: 8, macros: 16 });

    expect(updateDevice({ id: "rack", macroCount: 16 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
    });
    expect(rack.call).toHaveBeenCalledTimes(4);
  });

  it("refuses a count above 16 and names the limit", () => {
    const rack = registerMacroRack("rack", { count: 8, macros: 16 });

    expect(() => updateDevice({ id: "rack", macroCount: 20 })).toThrow(
      "macroCount 20 is above the most this rack has (16)",
    );
    expect(() => updateDevice({ id: "rack", macroCount: 17 })).toThrow(
      "macroCount 17 is above the most this rack has (16)",
    );
    expect(rack.call).not.toHaveBeenCalled();
  });

  it("lowers to 1 with nothing to report", () => {
    const rack = registerMacroRack("rack", { count: 8, floor: 1 });

    expect(updateDevice({ id: "rack", macroCount: 1 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
    });
    expect(rack.call).toHaveBeenCalledTimes(4);
  });

  it("stops when the count stops moving", () => {
    const rack = registerMacroRack("rack", { count: 8, floor: 6 });

    expect(updateDevice({ id: "rack", macroCount: 2 })).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      detail: "macroCount landed at 6, not 2",
    });
    expect(rack.call).toHaveBeenCalledTimes(2);
  });
});
