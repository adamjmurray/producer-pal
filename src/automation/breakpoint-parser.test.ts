// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { parseBreakpoints } from "./breakpoint-parser.ts";

describe("parseBreakpoints", () => {
  it("parst time=value Zeilen", () => {
    expect(parseBreakpoints("0=200\n4=8000")).toStrictEqual([
      { time: 0, value: 200 },
      { time: 4, value: 8000 },
    ]);
  });
  it("ignoriert Leerzeilen und // Kommentare", () => {
    expect(parseBreakpoints("\n// header\n2=300 // mid\n")).toStrictEqual([
      { time: 2, value: 300 },
    ]);
  });
  it("ueberspringt Zeilen ohne = oder mit nicht-numerischen Werten", () => {
    expect(parseBreakpoints("bogus\n1=abc\n3=400")).toStrictEqual([
      { time: 3, value: 400 },
    ]);
  });
  it("ueberspringt Zeilen mit nicht-numerischer Zeit (abc=100)", () => {
    expect(parseBreakpoints("abc=100\n2=300")).toStrictEqual([
      { time: 2, value: 300 },
    ]);
  });
  it("leerer Input -> leeres Array", () => {
    expect(parseBreakpoints("")).toStrictEqual([]);
  });
});
