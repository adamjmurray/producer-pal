// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  MeterDependentArgError,
  TransformArgError,
} from "#src/notation/transform/helpers/note-ops/transform-arg-errors.ts";
import { failuresByMeter } from "../transform-meter-failures.ts";

function groups(...strict: boolean[]): Map<string, { strict: boolean }> {
  return new Map(strict.map((value, i) => [`m${i}`, { strict: value }]));
}

/** A reader that fails for the named groups with the given error. */
function failing(
  failures: Record<number, Error>,
): (group: { strict: boolean }) => void {
  let call = 0;

  return () => {
    const error = failures[call++];

    if (error != null) {
      throw error;
    }
  };
}

describe("failuresByMeter", () => {
  it("returns nothing when every meter reads the transform", () => {
    expect(failuresByMeter(groups(false, false), failing({}))).toStrictEqual(
      new Map(),
    );
  });

  it("refuses at once for a mistake that holds in every meter", () => {
    expect(() =>
      failuresByMeter(
        groups(false, false),
        failing({ 1: new TransformArgError("bad everywhere") }),
      ),
    ).toThrow("bad everywhere");
  });

  it("leaves a meter-dependent failure to its meter while another reads it", () => {
    const failure = new MeterDependentArgError("bad in m0");

    expect(
      failuresByMeter(groups(false, false), failing({ 0: failure })),
    ).toStrictEqual(new Map([["m0", failure]]));
  });

  it("refuses when every meter fails", () => {
    expect(() =>
      failuresByMeter(
        groups(false, false),
        failing({
          0: new MeterDependentArgError("first"),
          1: new MeterDependentArgError("second"),
        }),
      ),
    ).toThrow("first");
  });

  it("refuses when a failing meter holds a strict clip", () => {
    expect(() =>
      failuresByMeter(
        groups(true, false),
        failing({ 0: new MeterDependentArgError("strict") }),
      ),
    ).toThrow("strict");
  });

  it("leaves a failure alone when only the other meter is strict", () => {
    expect(
      failuresByMeter(
        groups(false, true),
        failing({ 0: new MeterDependentArgError("fine") }),
      ).size,
    ).toBe(1);
  });
});
