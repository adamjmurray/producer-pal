// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { validateBreakpoints } from "../breakpoint-validator.ts";

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
    expect(() =>
      validateBreakpoints([{ time: -1, value: 200 }], range),
    ).toThrow(/time .* >= 0/);
  });
  it("wirft bei value ausserhalb range", () => {
    expect(() =>
      validateBreakpoints([{ time: 0, value: 99999 }], range),
    ).toThrow(/20\.\.20000/);
  });
  it("wirft bei unsortierter time", () => {
    expect(() =>
      validateBreakpoints(
        [
          { time: 4, value: 200 },
          { time: 1, value: 300 },
        ],
        range,
      ),
    ).toThrow(/aufsteigend/);
  });
  it("wirft bei leerer Liste", () => {
    expect(() => validateBreakpoints([], range)).toThrow(/mindestens 1/);
  });
  it("wirft bei NaN time", () => {
    expect(() =>
      validateBreakpoints([{ time: Number.NaN, value: 200 }], range),
    ).toThrow(/endlich|finite/i);
  });
  it("wirft bei NaN value", () => {
    expect(() =>
      validateBreakpoints([{ time: 0, value: Number.NaN }], range),
    ).toThrow(/endlich|finite/i);
  });
  it("wirft bei doppelter (gleicher) time", () => {
    expect(() =>
      validateBreakpoints(
        [
          { time: 2, value: 200 },
          { time: 2, value: 300 },
        ],
        range,
      ),
    ).toThrow(/aufsteigend/);
  });
});

// Slice-2b Abwaertskompat-Regressionsnetz (fixture-frei).
describe("validateBreakpoints — Slice-2b Abwaertskompat (ohne curve)", () => {
  it("repraesentative lineare Mehrpunkt-Liste unveraendert durchgereicht", () => {
    const bp = [
      { time: 0, value: 200 },
      { time: 2, value: 8000 },
      { time: 4, value: 400 },
    ];

    const out = validateBreakpoints(bp, range);

    expect(out).toStrictEqual(bp);
    // Identitaet: Validator gibt dieselbe Array-Referenz zurueck (kein Klon).
    expect(out).toBe(bp);
  });
});

// Slice-2b T3: curve ist ein bool-FLAG (v2). KEIN Range/Enum (nicht
// byte-belegt). Einzige neue Regel: ein curve-Flag am LETZTEN Breakpoint
// hat kein Folgesegment -> Fehler.
describe("validateBreakpoints — Slice-2b curve-Flag (T3)", () => {
  it("`curve:true` am letzten Breakpoint (kein Folgesegment) -> Fehler", () => {
    expect(() =>
      validateBreakpoints(
        [
          { time: 0, value: 200 },
          { time: 4, value: 8000, curve: true },
        ],
        range,
      ),
    ).toThrow(/letzte[nr]? breakpoint.*folgesegment|kein folgesegment/i);
  });

  it("einzelner Breakpoint mit `curve:true` -> Fehler (kein Folgesegment)", () => {
    expect(() =>
      validateBreakpoints([{ time: 0, value: 200, curve: true }], range),
    ).toThrow(/folgesegment/i);
  });

  it("`curve:true` an nicht-letztem Breakpoint ist gueltig", () => {
    const bp = [
      { time: 0, value: 200, curve: true },
      { time: 4, value: 8000 },
    ];

    const out = validateBreakpoints(bp, range);

    expect(out).toStrictEqual(bp);
    expect(out).toBe(bp);
    expect(out[0]?.curve).toBe(true);
  });

  it("kein Range/Enum-Check auf curve (Flag, nicht byte-belegt)", () => {
    // curve ist ein bool-Flag — es gibt keine Wert-Range zu pruefen. Der
    // value-Range-Check bleibt unveraendert (Slice-2-Bestand).
    const bp = [
      { time: 0, value: 200, curve: true },
      { time: 4, value: 8000 },
    ];

    expect(validateBreakpoints(bp, range)).toStrictEqual(bp);
  });

  it("lineares Segment (kein curve) bleibt unveraendert valide", () => {
    const bp = [
      { time: 0, value: 200 },
      { time: 4, value: 8000 },
    ];

    expect(validateBreakpoints(bp, range)).toStrictEqual(bp);
  });
});
