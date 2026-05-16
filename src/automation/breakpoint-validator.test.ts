// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { validateBreakpoints } from "./breakpoint-validator.ts";

const range = { min: 20, max: 20000 };

describe("validateBreakpoints", () => {
  it("akzeptiert sortierte gueltige Punkte", () => {
    const bp = [
      { time: 0, value: 200 },
      { time: 4, value: 8000 },
    ];

    expect(validateBreakpoints(bp, range)).toStrictEqual(bp);
  });
  it("wirft bei negativer time", () => {
    expect(() => validateBreakpoints([{ time: -1, value: 200 }], range)).toThrow(/time .* >= 0/);
  });
  it("wirft bei value ausserhalb range", () => {
    expect(() => validateBreakpoints([{ time: 0, value: 99999 }], range)).toThrow(/20\.\.20000/);
  });
  it("wirft bei unsortierter time", () => {
    expect(() => validateBreakpoints([{ time: 4, value: 200 }, { time: 1, value: 300 }], range)).toThrow(/aufsteigend/);
  });
  it("wirft bei leerer Liste", () => {
    expect(() => validateBreakpoints([], range)).toThrow(/mindestens 1/);
  });
});
