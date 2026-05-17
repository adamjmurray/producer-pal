// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  listGrooves,
  poolGrooveIds,
  locateGrooveEntry,
  GROOVE_TUNE_SPEC,
  patchGrooveTune,
  setClipGrooveId,
} from "../als-groove.ts";
import { readAls } from "../als-file.ts";

const THROW =
  "/Users/macuser/Desktop/AIbleton/_throwaway-automation-test Project/_throwaway-automation-test.als";
const ARR =
  "/Users/macuser/Desktop/AIbleton/producer-pal/e2e/live-sets/arrangement-clip-tests Project/arrangement-clip-tests.als";

const POOL_FILLED =
  '<GroovePool><LomId Value="0" /><Grooves>' +
  '<Groove Id="4"><LomId Value="0" /><Name Value="Swing 16ths 66" />' +
  '<Clip><Value><MidiClip Id="0" Time="0"><GrooveSettings><GrooveId Value="-1" /></GrooveSettings></MidiClip></Value></Clip>' +
  '<Grid Value="3" /><QuantizationAmount Value="0" /><TimingAmount Value="100" />' +
  '<RandomAmount Value="0" /><VelocityAmount Value="0" />' +
  '<Annotation Value="" /><Selection Value="true" /><SourceContext />' +
  '</Groove></Grooves><DefaultGrooveId Value="-1" /><GroovesListWrapper LomId="0" /></GroovePool>';
const POOL_EMPTY =
  '<GroovePool><LomId Value="0" /><Grooves /><DefaultGrooveId Value="-1" /><GroovesListWrapper LomId="0" /></GroovePool>';

// R-B (Anpassung A): Eintrag mit eingebettetem MidiClip-<Name Value="EMBED" />.
// listGrooves muss den Groove-Namen liefern, NICHT "EMBED".
const POOL_EMBED_NAME =
  '<GroovePool><LomId Value="0" /><Grooves>' +
  '<Groove Id="7"><LomId Value="0" /><Name Value="Real Groove Name" />' +
  '<Clip><Value><MidiClip Id="0" Time="0"><Name Value="EMBED" />' +
  '<GrooveSettings><GrooveId Value="-1" /></GrooveSettings></MidiClip></Value></Clip>' +
  '<Grid Value="3" /><QuantizationAmount Value="0" /><TimingAmount Value="100" />' +
  '<RandomAmount Value="0" /><VelocityAmount Value="0" />' +
  '<Annotation Value="" /><Selection Value="true" /><SourceContext />' +
  "</Groove></Grooves></GroovePool>";

describe("listGrooves", () => {
  it("parst gefüllten Pool (Id/Name/Amounts)", () => {
    const g = listGrooves(POOL_FILLED);

    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      id: "4",
      name: "Swing 16ths 66",
      Grid: "3",
      TimingAmount: "100",
    });
  });
  it("leerer Pool -> []", () => {
    expect(listGrooves(POOL_EMPTY)).toStrictEqual([]);
  });
  it("gegen echte throw.als: Groove Id 4 vorhanden", () => {
    const g = listGrooves(readAls(THROW));

    expect(g.some((x) => x.id === "4")).toBe(true);
  });
  it("gegen echte arrangement-clip-tests.als: leer", () => {
    expect(listGrooves(readAls(ARR))).toStrictEqual([]);
  });
  // R-B Pflicht-Test (a): echte throw.als -> Name aus dem Groove-Eintrag,
  // NICHT aus dem eingebetteten MidiClip (beide heißen hier zufällig gleich,
  // der Test sichert die Fenster-Extraktion gegen Regressionen ab).
  it("R-B (a): echte throw.als listGrooves(...)[0].name === 'Swing 16ths 66'", () => {
    const g = listGrooves(readAls(THROW));

    expect(g[0]?.name).toBe("Swing 16ths 66");
  });
  // R-B Pflicht-Test (b): eingebetteter MidiClip-<Name Value="EMBED" /> darf
  // den Groove-Namen NICHT überschreiben.
  it("R-B (b): EMBED-inline -> name ist Groove-Name NICHT 'EMBED'", () => {
    const g = listGrooves(POOL_EMBED_NAME);

    expect(g).toHaveLength(1);
    expect(g[0]?.name).toBe("Real Groove Name");
    expect(g[0]?.name).not.toBe("EMBED");
  });
});

describe("poolGrooveIds", () => {
  it("liefert ['4'] / []", () => {
    expect(poolGrooveIds(POOL_FILLED)).toStrictEqual(["4"]);
    expect(poolGrooveIds(POOL_EMPTY)).toStrictEqual([]);
  });
});

describe("locateGrooveEntry", () => {
  it("findet <Groove Id=4>-Block trotz eingebettetem MidiClip", () => {
    const loc = locateGrooveEntry(POOL_FILLED, "4");

    expect(loc.block.startsWith('<Groove Id="4">')).toBe(true);
    expect(loc.block.endsWith("</Groove>")).toBe(true);
    expect(POOL_FILLED.slice(loc.start, loc.end)).toBe(loc.block);
  });
  it("wirft bei nicht existierender Id mit verfügbaren Ids", () => {
    expect(() => locateGrooveEntry(POOL_FILLED, "9")).toThrow(/9|verfügbar|4/);
  });
});

describe("GROOVE_TUNE_SPEC", () => {
  it("genau 5 Amount-Keys", () => {
    expect(Object.keys(GROOVE_TUNE_SPEC).sort()).toStrictEqual(
      [
        "Grid",
        "QuantizationAmount",
        "RandomAmount",
        "TimingAmount",
        "VelocityAmount",
      ].sort(),
    );
  });
});

describe("patchGrooveTune", () => {
  it("patcht TimingAmount nur im Ziel-Groove-Eintrag", () => {
    const out = patchGrooveTune(POOL_FILLED, "4", "TimingAmount", "50");

    expect(out).toContain('<TimingAmount Value="50" />');
    expect(out.replace('Value="50"', 'Value="100"')).toBe(POOL_FILLED);
  });
  it("OFF-TARGET: tune trifft NICHT den eingebetteten MidiClip-<GrooveId>", () => {
    const out = patchGrooveTune(POOL_FILLED, "4", "Grid", "5");

    expect(out).toContain('<GrooveId Value="-1" />'); // eingebetteter MidiClip unberührt
    expect(out).toContain('<Grid Value="5" />');
  });
  it("unbekannter Key wirft mit Spec-Liste", () => {
    expect(() => patchGrooveTune(POOL_FILLED, "4", "Nope", "1")).toThrow(
      /Grid|TimingAmount/,
    );
  });
  it("int-Wert ungültig wirft", () => {
    expect(() => patchGrooveTune(POOL_FILLED, "4", "Grid", "x")).toThrow(
      /ganzzahl|integer|finite/i,
    );
  });
  it("Id nicht im Pool wirft", () => {
    expect(() => patchGrooveTune(POOL_FILLED, "9", "Grid", "1")).toThrow(
      /9|verfügbar/,
    );
  });
  it("Amount-Tag fehlt im Eintrag wirft (Error-Branch)", () => {
    const noTag = POOL_FILLED.replace('<Grid Value="3" />', "");

    expect(() => patchGrooveTune(noTag, "4", "Grid", "1")).toThrow(
      /Grid|nicht gefunden/,
    );
  });
});

describe("setClipGrooveId (Konsistenz)", () => {
  const CLIP =
    '<MidiClip><Ram Value="false" /><GrooveSettings><GrooveId Value="-1" /></GrooveSettings><Disabled Value="false" /></MidiClip>';

  it("setzt GrooveId im GrooveSettings-Scope", () => {
    const out = setClipGrooveId(CLIP, "4");

    expect(out).toContain(
      '<GrooveSettings><GrooveId Value="4" /></GrooveSettings>',
    );
    expect(out.replace('Value="4"', 'Value="-1"')).toBe(CLIP);
  });
  it("-1 (lösen) immer erlaubt", () => {
    expect(setClipGrooveId(CLIP.replace('"-1"', '"4"'), "-1")).toContain(
      '<GrooveId Value="-1" />',
    );
  });
  it("nicht-Integer GrooveId wirft", () => {
    expect(() => setClipGrooveId(CLIP, "x")).toThrow(/integer|ganzzahl/i);
  });
  it("kein <GrooveSettings> wirft (Error-Branch)", () => {
    expect(() => setClipGrooveId("<MidiClip></MidiClip>", "4")).toThrow(
      /GrooveSettings/,
    );
  });
  it("kein <GrooveId> im GrooveSettings wirft (Error-Branch)", () => {
    expect(() =>
      setClipGrooveId(
        "<MidiClip><GrooveSettings></GrooveSettings></MidiClip>",
        "4",
      ),
    ).toThrow(/GrooveId/);
  });
});
