// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "./barbeat-parser.ts";

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
