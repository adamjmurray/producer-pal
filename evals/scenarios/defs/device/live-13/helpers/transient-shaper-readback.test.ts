// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { toolCall, turnsOf } from "../../../helpers/turns-test-helpers.ts";
import {
  transientShaperArgs,
  transientShaperProblem,
} from "./transient-shaper-readback.ts";

/**
 * @param sidechain - What S/C On reads as
 * @param gain - What S/C Gain reads as
 * @returns A read-device result with Attack 40 and Dry/Wet 50
 */
const read = (sidechain: string, gain: string): unknown => ({
  parameters: [
    { name: "Attack", value: "40 %" },
    { name: "Dry/Wet", value: "50 %" },
    { name: "S/C On", value: sidechain },
    { name: "S/C Gain", value: gain },
  ],
});

describe("transientShaperArgs", () => {
  const create = (
    path: string,
    name = "Transient Shaper",
  ): ReturnType<typeof toolCall> =>
    toolCall(
      "ppal-create-device",
      { deviceName: name, path: "t1" },
      `{id:"88",path:"${path}"}`,
    );

  it("reads the last Transient Shaper created by its id", () => {
    expect(transientShaperArgs(turnsOf([create("t1/d2")]))).toStrictEqual({
      id: "88",
      include: ["params", "param-values"],
    });
  });

  it("throws when none was created", () => {
    const other = create("t1/d2", "Utility");

    expect(() => transientShaperArgs(turnsOf([other]))).toThrow(
      /no successful create-device/,
    );
  });

  it("throws when it landed on another track", () => {
    expect(() => transientShaperArgs(turnsOf([create("t0/d1")]))).toThrow(
      /not on the Racks track/,
    );
  });

  it("reads an array result by its first entry", () => {
    const listed = toolCall(
      "ppal-create-device",
      { deviceName: "Transient Shaper", path: "t1" },
      '[{id:"9",path:"t1/d3"}]',
    );

    expect(transientShaperArgs(turnsOf([listed])).id).toBe("9");
  });
});

describe("transientShaperProblem", () => {
  it("accepts the sidechain on with the gain at +6", () => {
    expect(transientShaperProblem(read("On", "6 dB"))).toBeNull();
  });

  it("accepts the sidechain still off, whatever the gain reads", () => {
    expect(transientShaperProblem(read("Off", "0 dB"))).toBeNull();
  });

  it("wants the gain at +6 once the sidechain is on", () => {
    expect(transientShaperProblem(read("On", "0 dB"))).toBe(
      "S/C Gain reads 0, wanted 6",
    );
  });

  it("names Attack and Dry/Wet that are off, and a missing S/C On", () => {
    expect(transientShaperProblem({})).toBe(
      "Attack reads no number, wanted 40; Dry/Wet reads no number, wanted 50; no S/C On param",
    );
  });
});
