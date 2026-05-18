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

describe("validateBreakpoints — Slice-2b curve-Feld Ist-Verhalten", () => {
  it("Ist: vorhandenes curve-Feld wird IGNORIERT (kein Range-/Enum-Check)", () => {
    // Der Validator prueft aktuell nur time/value. curve faellt nicht durch
    // die Validierungsschleife -> beliebiger Wert passiert unveraendert.
    // T3 fuehrt bewusst den Range/Enum-Check ein.
    const bp = [
      { time: 0, value: 200, curve: 9999 },
      { time: 2, value: 8000 },
    ];

    const out = validateBreakpoints(bp, range);

    expect(out).toStrictEqual(bp);
    expect(out[0]?.curve).toBe(9999);
  });
});

describe("validateBreakpoints — Slice-2b kuenftiger curve-Vertrag (it.todo)", () => {
  // Range/Enum + Vorzeichen UNBEKANNT bis G2b — keine konkreten Werte.
  it.todo("curve-Wert ausserhalb der G2b-Range/Enum -> Fehler");
  it.todo("`~` am letzten Breakpoint (kein Folgesegment) -> Fehler");
  it.todo("lineares Segment (kein curve) bleibt nach G2b unveraendert valide");
});
