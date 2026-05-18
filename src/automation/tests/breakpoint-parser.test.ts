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

describe("parseBreakpoints — Slice-2b ~curve Ist-Verhalten", () => {
  it("Ist: `~curve`-Suffix macht value nicht-numerisch -> Zeile verworfen", () => {
    // "0=200~0.5" -> Number("200~0.5")=NaN -> Zeile uebersprungen (mit warn).
    // Der `~`-Breakpoint geht aktuell VERLOREN. T2 aendert das bewusst.
    expect(parseBreakpoints("0=200~0.5\n2=8000\n4=400")).toStrictEqual([
      { time: 2, value: 8000 },
      { time: 4, value: 400 },
    ]);
  });

  it("Ist: einzelner `~curve`-Breakpoint -> leeres Array", () => {
    expect(parseBreakpoints("0=200~0.5")).toStrictEqual([]);
  });
});

describe("parseBreakpoints — Slice-2b kuenftiger ~-Vertrag (it.todo)", () => {
  // Konkrete Range-/Kodierungs-Annahmen UNBEKANNT bis Recon-Gate G2b.
  // Nur Vertrags-Skizzen, keine festgenagelten Werte.
  it.todo(
    "ohne `~` byte-gleicher Output zum Bestand (T1-Netz bleibt gruen)",
  );
  it.todo("`~<kurve>`-Suffix am Start-Breakpoint wird als curve geparst");
  it.todo("Mehrpunkt-Eingabe mit gemischt linearen und `~`-Segmenten");
});
