// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  noParamLanded,
  paramsOf,
  registerContinuousParam,
  updateDevice,
} from "../../update-device-test-helpers.ts";
import { registerDevice } from "./param-addressing-fixtures.ts";

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

  it("names a blank-named macro by its original name alone", () => {
    registerDevice("p-macro");

    const param = registerContinuousParam("p-macro", {
      name: " ",
      originalName: "Macro 3",
      display: (v) => Number(v).toFixed(2),
    });

    const result = updateDevice({
      id: "123",
      params: [{ name: "Macro 3", value: "0.5" }],
    });

    expect(param.set).toHaveBeenCalledWith("value", 0.5);
    expect(paramsOf(result)).toStrictEqual([
      expect.objectContaining({ id: "p-macro", name: "Macro 3" }),
    ]);
  });
});
