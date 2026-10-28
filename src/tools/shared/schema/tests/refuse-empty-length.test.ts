// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  refuseEmptyInEveryMeter,
  refuseEmptyLength,
} from "../refuse-empty-length.ts";

describe("refuseEmptyLength", () => {
  it("refuses zero and less, naming the length as written", () => {
    expect(() => refuseEmptyLength("0bar", 0)).toThrow(
      'length "0bar" must be longer than zero',
    );
    expect(() => refuseEmptyLength("1bar-n/1", -4)).toThrow("1bar-n/1");
  });

  it("takes a length that spans something", () => {
    expect(() => refuseEmptyLength("1bar", 4)).not.toThrow();
  });
});

describe("refuseEmptyInEveryMeter", () => {
  it.each(["0bar", "n0/4", "0bar-n/4"])("refuses %s", (length) => {
    expect(() => refuseEmptyInEveryMeter(length)).toThrow(
      `length "${length}" must be longer than zero`,
    );
  });

  // 140 whole notes is 560 beats: empty in 4/4 and 99/1 (396 beats a bar), but
  // not in a 150/1 bar (600 beats).
  it("leaves a length that is empty only in some meters", () => {
    expect(() => refuseEmptyInEveryMeter("1bar-n/1")).not.toThrow();
    expect(() => refuseEmptyInEveryMeter("1bar-n140/1")).not.toThrow();
  });

  it("refuses a length that won't parse", () => {
    expect(() => refuseEmptyInEveryMeter("banana")).toThrow(
      "Invalid duration format",
    );
  });
});
