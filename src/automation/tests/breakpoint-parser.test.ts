// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { parseBreakpoints } from "../breakpoint-parser.ts";

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

// Slice-2b Abwaertskompat-Regressionsnetz (fixture-frei).
// Friert das LINEARE Bestandsverhalten ein, BEVOR der optionale
// `~curve`-Token in --breakpoints gebaut wird (Plan T2). KEIN Produktivcode
// hier; aenderbar erst nach Recon-Gate G2b (Semantik bis dahin unbekannt).
describe("parseBreakpoints — Slice-2b Abwaertskompat (ohne ~)", () => {
  it("repraesentative lineare Mehrpunkt-Eingabe bleibt exakt erhalten", () => {
    // Bestands-Format ist NEWLINE-separiert (nicht Komma). Charakterisierung
    // des Ist-Werts, der nach T2 byte-gleich bleiben MUSS.
    expect(parseBreakpoints("0=200\n2=8000\n4=400")).toStrictEqual([
      { time: 0, value: 200 },
      { time: 2, value: 8000 },
      { time: 4, value: 400 },
    ]);
  });

  it("Ist-Befund: Komma-separierte Eingabe wird NICHT als Mehrpunkt geparst", () => {
    // "0=200,2=8000,4=400" ist EINE Zeile -> Number("200,2=8000,4=400")=NaN
    // -> komplette Zeile verworfen. Dokumentiert das aktuelle Verhalten
    // (Komma-Syntax existiert im Parser noch nicht).
    expect(parseBreakpoints("0=200,2=8000,4=400")).toStrictEqual([]);
  });
});

// Slice-2b T2: `~`-Suffix am Wert = bool curve-FLAG (v2-Spec, byte-belegt
// via G2b-Fixture: KEINE Kruemmungs-Staerke/Float nach `~`, reines Flag).
describe("parseBreakpoints — Slice-2b ~curve-Flag (T2)", () => {
  it("ohne `~` byte-gleicher Output zum Bestand (kein curve-Feld)", () => {
    // T1-Netz-Invariante: der `~`-lose Pfad bleibt exakt der Slice-2-Bestand.
    expect(parseBreakpoints("0=200\n2=8000\n4=400")).toStrictEqual([
      { time: 0, value: 200 },
      { time: 2, value: 8000 },
      { time: 4, value: 400 },
    ]);
  });

  it("`~`-Suffix am Wert setzt curve:true, Wert bleibt numerisch", () => {
    expect(parseBreakpoints("0=200~\n4=8000\n8=400")).toStrictEqual([
      { time: 0, value: 200, curve: true },
      { time: 4, value: 8000 },
      { time: 8, value: 400 },
    ]);
  });

  it("`~` mit Whitespace zwischen Wert und Suffix wird toleriert", () => {
    expect(parseBreakpoints("0=200 ~\n4=8000")).toStrictEqual([
      { time: 0, value: 200, curve: true },
      { time: 4, value: 8000 },
    ]);
  });

  it("mehrere `~`-Breakpoints in gemischter Lane", () => {
    expect(parseBreakpoints("0=200~\n4=8000\n8=400~\n12=100")).toStrictEqual([
      { time: 0, value: 200, curve: true },
      { time: 4, value: 8000 },
      { time: 8, value: 400, curve: true },
      { time: 12, value: 100 },
    ]);
  });

  it("einzelner `~`-Breakpoint wird geparst (Validator faengt Letzten ab)", () => {
    expect(parseBreakpoints("0=200~")).toStrictEqual([
      { time: 0, value: 200, curve: true },
    ]);
  });

  it("`~` mit nachfolgendem Text (kein Float byte-belegt) -> Flag, Rest ignoriert", () => {
    // Scope A: KEINE Kruemmungs-Staerke. Alles nach `~` ist nicht byte-belegt
    // und wird verworfen; nur das Flag zaehlt.
    expect(parseBreakpoints("0=200~0.5\n4=8000")).toStrictEqual([
      { time: 0, value: 200, curve: true },
      { time: 4, value: 8000 },
    ]);
  });

  it("`~` mit nicht-numerischem Wert -> Zeile weiterhin verworfen", () => {
    expect(parseBreakpoints("0=abc~\n4=8000")).toStrictEqual([
      { time: 4, value: 8000 },
    ]);
  });
});
