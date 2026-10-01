// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  children,
  livePath,
  noParamLanded,
  paramsOf,
  registerContinuousParam,
  registerMockObject,
  updateDevice,
} from "../../update-device-test-helpers.ts";

/**
 * Register the device under test at t0/d0, holding the given params.
 * @param paramIds - Parameter mock ids, in the device's parameter order
 */
function registerDevice(...paramIds: string[]): void {
  registerMockObject("123", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { parameters: children(...paramIds) },
  });
}

describe("updateDevice - param names Live pads with spaces", () => {
  // Operator's "A Fix On " carries a trailing space in Live's own name.
  it.each(["A Fix On", "A Fix On ", "a fix on"])(
    "writes a param named 'A Fix On ' when sent as '%s'",
    (name) => {
      registerDevice("p-fix");

      const param = registerContinuousParam("p-fix", {
        name: "A Fix On ",
        value: 0,
        display: (v) => Number(v).toFixed(2),
      });

      const result = updateDevice({
        id: "123",
        params: [{ name, value: "1" }],
      });

      expect(param.set).toHaveBeenCalledWith("value", 1);
      expect(paramsOf(result)).toStrictEqual([
        expect.objectContaining({ id: "p-fix", name: "A Fix On" }),
      ]);
    },
  );

  it("still treats two params that differ only by padding as ambiguous", () => {
    registerDevice("p-a", "p-b");

    const paramA = registerContinuousParam("p-a", { name: "Width" });
    const paramB = registerContinuousParam("p-b", { name: "Width " });

    const message = noParamLanded(() =>
      updateDevice({ id: "123", params: [{ name: "Width", value: "0.5" }] }),
    );

    expect(message).toContain("names 2 params");
    expect(paramA.set).not.toHaveBeenCalled();
    expect(paramB.set).not.toHaveBeenCalled();
  });

  it("matches a padded rack macro name with its original name", () => {
    registerDevice("p-macro");

    const param = registerContinuousParam("p-macro", {
      name: "Reverb ",
      originalName: "Macro 1",
      display: (v) => Number(v).toFixed(2),
    });

    updateDevice({
      id: "123",
      params: [{ name: "Reverb (Macro 1)", value: "0.5" }],
    });

    expect(param.set).toHaveBeenCalledWith("value", 0.5);
  });
});
