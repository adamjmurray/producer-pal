// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";

describe("BarBeatScript Parser - bar copy", () => {
  it("parses single bar copy", () => {
    expect(parser.parse("@5=1")).toStrictEqual([
      { destination: { bar: 5 }, source: { bar: 1 } },
    ]);
  });

  it("parses range copy", () => {
    expect(parser.parse("@5=1-4")).toStrictEqual([
      { destination: { bar: 5 }, source: { range: [1, 4] } },
    ]);
  });

  it("parses previous bar copy", () => {
    expect(parser.parse("@2=")).toStrictEqual([
      { destination: { bar: 2 }, source: "previous" },
    ]);
  });

  it("rejects bar 0 anywhere in a bar copy", () => {
    const steer = /bars are 1-indexed.*first bar is bar 1.*Got bar 0\./;

    expect(() => parser.parse("@0=1")).toThrow(steer);
    expect(() => parser.parse("@1=0")).toThrow(steer);
    expect(() => parser.parse("@0=")).toThrow(steer);
    expect(() => parser.parse("@0-2=1")).toThrow(steer);
    expect(() => parser.parse("@2-0=1")).toThrow(steer);
    expect(() => parser.parse("@5=0-3")).toThrow(steer);
    expect(() => parser.parse("@5=1-0")).toThrow(steer);
    expect(() => parser.parse("@01=1")).toThrow(/Got bar 01\./);
  });

  it("only steers a bar copy bar that starts with 0", () => {
    expect(parser.parse("@10=1")).toStrictEqual([
      { destination: { bar: 10 }, source: { bar: 1 } },
    ]);
    expect(parser.parse("@1=10")).toStrictEqual([
      { destination: { bar: 1 }, source: { bar: 10 } },
    ]);
    expect(parser.parse("@10-20=100")).toStrictEqual([
      { destination: { range: [10, 20] }, source: { bar: 100 } },
    ]);
  });

  it("parses clear buffer", () => {
    expect(parser.parse("@clear")).toStrictEqual([{ clearBuffer: true }]);
  });

  it("parses chained copies", () => {
    expect(parser.parse("@2= @3= @4=")).toStrictEqual([
      { destination: { bar: 2 }, source: "previous" },
      { destination: { bar: 3 }, source: "previous" },
      { destination: { bar: 4 }, source: "previous" },
    ]);
  });

  it("parses mixed with notes and time", () => {
    expect(parser.parse("C3 1|1 @2=1 D3 2|1")).toStrictEqual([
      { pitch: 60 },
      { bar: 1, beat: 1 },
      { destination: { bar: 2 }, source: { bar: 1 } },
      { pitch: 62 },
      { bar: 2, beat: 1 },
    ]);
  });
});
