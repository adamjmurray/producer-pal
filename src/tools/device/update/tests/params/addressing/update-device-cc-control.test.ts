// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Max's Live API lists no members for a CC Control, but its params still answer
// by index, so they can be found by name and set.

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMockRegistry,
  lookupMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerCcControl } from "../../../../tests/helpers/cc-control-fixtures.ts";
import {
  expectValueSet,
  paramsOf,
  updateDevice,
} from "../../update-device-test-helpers.ts";

describe("updateDevice - CC Control", () => {
  beforeEach(() => {
    clearMockRegistry();
    registerCcControl();
  });

  it("sets Mod Wheel by name", () => {
    const result = updateDevice({
      id: "cc-1",
      params: [{ name: "Mod Wheel", value: "64" }],
    });

    expect(paramsOf(result)).toStrictEqual([
      expect.objectContaining({ id: "901", name: "Mod Wheel" }),
    ]);
    expect(expectValueSet(lookupMockObject("901") as never)).toBe(64);
  });

  it("sets a param by id", () => {
    updateDevice({ id: "cc-1", params: [{ id: "902", value: "10" }] });

    expect(expectValueSet(lookupMockObject("902") as never)).toBe(10);
  });

  it("refuses a name it doesn't have", () => {
    expect(() =>
      updateDevice({
        id: "cc-1",
        params: [{ name: "Expression", value: "1" }],
      }),
    ).toThrow('"Expression": not found');
  });
});
