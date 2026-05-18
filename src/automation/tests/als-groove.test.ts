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
  // FIX 2: Inline-Groove-Eintrag OHNE eingebetteten <Clip>. Vorher führte
  // block.indexOf("</Clip>") === -1 zu block.slice(-1) -> alle Amounts "".
  it("FIX 2: Eintrag OHNE <Clip> -> korrekte Amounts und Name", () => {
    const noClip =
      '<GroovePool><LomId Value="0" /><Grooves>' +
      '<Groove Id="9"><LomId Value="0" /><Name Value="No Clip Groove" />' +
      '<Grid Value="3" /><QuantizationAmount Value="0" /><TimingAmount Value="100" />' +
      '<RandomAmount Value="0" /><VelocityAmount Value="0" />' +
      "</Groove></Grooves></GroovePool>";
    const g = listGrooves(noClip);

    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      id: "9",
      name: "No Clip Groove",
      Grid: "3",
      QuantizationAmount: "0",
      TimingAmount: "100",
      RandomAmount: "0",
      VelocityAmount: "0",
    });
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
  // FIX 3: negative Werte für Amount-Keys müssen abgelehnt werden.
  it("FIX 3: negativer Amount-Wert wirft (-1)", () => {
    expect(() => patchGrooveTune(POOL_FILLED, "4", "Grid", "-1")).toThrow(
      /ganzzahl|integer/i,
    );
  });
  it("FIX 3: leer / Float werfen ebenfalls", () => {
    expect(() => patchGrooveTune(POOL_FILLED, "4", "Grid", "")).toThrow(
      /ganzzahl|integer/i,
    );
    expect(() => patchGrooveTune(POOL_FILLED, "4", "Grid", "1.5")).toThrow(
      /ganzzahl|integer/i,
    );
  });
  it("FIX 3: nicht-negative Werte (0/3/100) weiter ok", () => {
    expect(patchGrooveTune(POOL_FILLED, "4", "Grid", "0")).toContain(
      '<Grid Value="0" />',
    );
    expect(patchGrooveTune(POOL_FILLED, "4", "Grid", "3")).toContain(
      '<Grid Value="3" />',
    );
    expect(patchGrooveTune(POOL_FILLED, "4", "Grid", "100")).toContain(
      '<Grid Value="100" />',
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
  // FIX 1: astronomisch große Id (kein safe integer) muss werfen.
  it("FIX 1: nicht-safe-integer GrooveId wirft", () => {
    expect(() => setClipGrooveId(CLIP, "99999999999999999999")).toThrow(
      /integer|ganzzahl|sicher|safe/i,
    );
  });
  it("FIX 1: -1 und normale positive Ids weiter ok", () => {
    expect(setClipGrooveId(CLIP, "-1")).toContain('<GrooveId Value="-1" />');
    expect(setClipGrooveId(CLIP, "4")).toContain('<GrooveId Value="4" />');
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

// Slice-5 Branch-Coverage: gezielte Error-/Edge-Branches in als-groove.ts,
// die von den ursprünglichen 27 Tests nicht erreicht wurden. Additiv —
// bestehende Tests unverändert. Jeder Test deckt genau einen Zweig ab.
describe("als-groove Error-/Edge-Branches (Slice 5)", () => {
  // b2[0] L116-119: locateGrooveEntry — Open-Tag vorhanden, aber kein
  // </Groove> dahinter.
  it("locateGrooveEntry: <Groove> ohne </Groove> wirft (nicht geschlossen)", () => {
    const broken = '<Grooves><Groove Id="4"><LomId Value="0" />';

    expect(() => locateGrooveEntry(broken, "4")).toThrow(
      /nicht geschlossen|unerwartetes \.als-Format/,
    );
  });

  // b5[0] L165-168: patchGrooveTune — Ziel-Eintrag existiert, aber kein
  // eingebetteter <Clip> (kein </Clip>). Key/Value valide, Id valide.
  it("patchGrooveTune: kein <Clip> im Groove-Eintrag wirft", () => {
    const noClip =
      '<GroovePool><LomId Value="0" /><Grooves>' +
      '<Groove Id="4"><LomId Value="0" /><Name Value="X" />' +
      '<Grid Value="3" /><QuantizationAmount Value="0" /><TimingAmount Value="100" />' +
      '<RandomAmount Value="0" /><VelocityAmount Value="0" />' +
      "</Groove></Grooves></GroovePool>";

    expect(() => patchGrooveTune(noClip, "4", "Grid", "1")).toThrow(
      /kein <Clip>|unerwartetes \.als-Format/,
    );
  });

  // b7[0] L182-185: patchGrooveTune — Tag nach </Clip> mehrfach -> mehrdeutig.
  it("patchGrooveTune: Tag mehrfach nach <Clip> wirft (mehrdeutig)", () => {
    const dup =
      '<GroovePool><LomId Value="0" /><Grooves>' +
      '<Groove Id="4"><LomId Value="0" /><Name Value="X" />' +
      '<Clip><Value><MidiClip Id="0" Time="0"><GrooveSettings><GrooveId Value="-1" /></GrooveSettings></MidiClip></Value></Clip>' +
      '<Grid Value="3" /><Grid Value="4" /><QuantizationAmount Value="0" />' +
      '<TimingAmount Value="100" /><RandomAmount Value="0" /><VelocityAmount Value="0" />' +
      "</Groove></Grooves></GroovePool>";

    expect(() => patchGrooveTune(dup, "4", "Grid", "1")).toThrow(
      /mehrdeutig|2-mal/,
    );
  });

  // b13[0] L242-245: setClipGrooveId — <GrooveId> mehrfach im
  // GrooveSettings-Scope -> mehrdeutig.
  it("setClipGrooveId: <GrooveId> mehrfach im Scope wirft (mehrdeutig)", () => {
    const dup =
      '<MidiClip><GrooveSettings><GrooveId Value="-1" /><GrooveId Value="2" /></GrooveSettings></MidiClip>';

    expect(() => setClipGrooveId(dup, "4")).toThrow(/mehrdeutig|2-mal/);
  });

  // b15[1] L278: grooveEntriesRaw — kein <GroovePool>-Wrapper, fällt auf
  // gesamtes xml als Pool zurück (poolM falsy-Branch). Via listGrooves.
  it("listGrooves: ohne <GroovePool>-Wrapper nutzt gesamtes XML als Pool", () => {
    const noPool =
      '<Grooves><Groove Id="11"><LomId Value="0" /><Name Value="NP" />' +
      '<Clip><Value><MidiClip Id="0" Time="0" /></Value></Clip>' +
      '<Grid Value="2" /><QuantizationAmount Value="0" /><TimingAmount Value="50" />' +
      '<RandomAmount Value="0" /><VelocityAmount Value="0" />' +
      "</Groove></Grooves>";
    const g = listGrooves(noPool);

    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ id: "11", name: "NP", TimingAmount: "50" });
  });

  // b17[0] L287: grooveEntriesRaw — <Grooves> ohne </Grooves>, scope geht
  // bis Pool-Ende (groovesClose === -1 Branch).
  it("listGrooves: <Grooves> ohne </Grooves> -> scope bis Ende", () => {
    const noClose =
      '<GroovePool><LomId Value="0" /><Grooves>' +
      '<Groove Id="12"><LomId Value="0" /><Name Value="NC" />' +
      '<Clip><Value><MidiClip Id="0" Time="0" /></Value></Clip>' +
      '<Grid Value="1" /><QuantizationAmount Value="0" /><TimingAmount Value="33" />' +
      '<RandomAmount Value="0" /><VelocityAmount Value="0" />' +
      "</Groove>";
    const g = listGrooves(noClose);

    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ id: "12", name: "NC", TimingAmount: "33" });
  });

  // b19[0] L303-306: grooveEntriesRaw — Open-Tag im scope, aber kein
  // </Groove> dahinter -> wirft "nicht geschlossen". <Grooves> geschlossen
  // damit b17 NICHT betroffen ist, der Block selbst aber offen bleibt.
  it("listGrooves: Groove-Open ohne </Groove> im scope wirft", () => {
    const broken =
      '<GroovePool><LomId Value="0" /><Grooves>' +
      '<Groove Id="13"><LomId Value="0" /><Name Value="B" />' +
      "</Grooves></GroovePool>";

    expect(() => listGrooves(broken)).toThrow(
      /nicht geschlossen|unerwartetes \.als-Format/,
    );
  });

  // b20[0] L334: extractEntryName — Block ohne <LomId -> Name "". Via
  // listGrooves: Eintrag ohne <LomId, Amounts werden trotzdem gelesen.
  it("listGrooves: Eintrag ohne <LomId -> name leer", () => {
    const noLom =
      '<GroovePool><LomId Value="0" /><Grooves>' +
      '<Groove Id="14"><Name Value="Ignored" />' +
      '<Clip><Value><MidiClip Id="0" Time="0" /></Value></Clip>' +
      '<Grid Value="3" /><QuantizationAmount Value="0" /><TimingAmount Value="77" />' +
      '<RandomAmount Value="0" /><VelocityAmount Value="0" />' +
      "</Groove></Grooves></GroovePool>";
    const g = listGrooves(noLom);

    expect(g).toHaveLength(1);
    expect(g[0]?.name).toBe("");
    expect(g[0]?.TimingAmount).toBe("77");
  });

  // b23[1] L340: extractEntryName — <LomId vorhanden, aber kein <Name Value>
  // im Fenster -> nameM null -> "".
  it("listGrooves: Eintrag mit <LomId aber ohne <Name> -> name leer", () => {
    const noName =
      '<GroovePool><LomId Value="0" /><Grooves>' +
      '<Groove Id="15"><LomId Value="0" />' +
      '<Clip><Value><MidiClip Id="0" Time="0" /></Value></Clip>' +
      '<Grid Value="3" /><QuantizationAmount Value="0" /><TimingAmount Value="88" />' +
      '<RandomAmount Value="0" /><VelocityAmount Value="0" />' +
      "</Groove></Grooves></GroovePool>";
    const g = listGrooves(noName);

    expect(g).toHaveLength(1);
    expect(g[0]?.name).toBe("");
    expect(g[0]?.TimingAmount).toBe("88");
  });

  // b24[1] L352: scalarOrEmpty — Amount-Tag fehlt -> "" (m null Branch).
  // listGrooves liest Amounts nach </Clip>; fehlt ein Tag -> "".
  it("listGrooves: fehlende Amount-Tags -> leere Strings", () => {
    const partial =
      '<GroovePool><LomId Value="0" /><Grooves>' +
      '<Groove Id="16"><LomId Value="0" /><Name Value="P" />' +
      '<Clip><Value><MidiClip Id="0" Time="0" /></Value></Clip>' +
      '<TimingAmount Value="100" />' +
      "</Groove></Grooves></GroovePool>";
    const g = listGrooves(partial);

    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      id: "16",
      name: "P",
      Grid: "",
      QuantizationAmount: "",
      TimingAmount: "100",
      RandomAmount: "",
      VelocityAmount: "",
    });
  });
});

// Slice-5b Regressions-Sicherheitsnetz (Task 1, fixture-frei). Friert das
// Ist-Verhalten von poolGrooveIds/listGrooves UND eine Byte-Invariante ein,
// BEVOR 5b (neuer GroovePool-Eintrag via .agr-Import) gebaut wird. Keine
// Annahmen ueber das kuenftige .agr-Format — reine Charakterisierung des
// aktuellen Verhaltens + it.todo-Skizzen fuer den 5b-Vertrag.
describe("Slice-5b Regressions-Charakterisierung (Bestand eingefroren)", () => {
  // Repraesentativer Mehr-Eintrag-Pool wie er in einem Bestands-Set vorkommt
  // (zwei <Groove>-Eintraege, eingebetteter MidiClip, Pool-Rahmen-Tags).
  const POOL_MULTI =
    '<GroovePool><LomId Value="0" /><Grooves>' +
    '<Groove Id="4"><LomId Value="0" /><Name Value="Swing 16ths 66" />' +
    '<Clip><Value><MidiClip Id="0" Time="0"><GrooveSettings><GrooveId Value="-1" /></GrooveSettings></MidiClip></Value></Clip>' +
    '<Grid Value="3" /><QuantizationAmount Value="0" /><TimingAmount Value="100" />' +
    '<RandomAmount Value="0" /><VelocityAmount Value="0" />' +
    '<Annotation Value="" /><Selection Value="true" /><SourceContext />' +
    "</Groove>" +
    '<Groove Id="9"><LomId Value="0" /><Name Value="MPC 8-Swing" />' +
    '<Clip><Value><MidiClip Id="0" Time="0"><GrooveSettings><GrooveId Value="-1" /></GrooveSettings></MidiClip></Value></Clip>' +
    '<Grid Value="2" /><QuantizationAmount Value="0" /><TimingAmount Value="62" />' +
    '<RandomAmount Value="0" /><VelocityAmount Value="0" />' +
    '<Annotation Value="" /><Selection Value="false" /><SourceContext />' +
    "</Groove>" +
    '</Grooves><DefaultGrooveId Value="-1" /><GroovesListWrapper LomId="0" /></GroovePool>';

  // (a) Ist-Verhalten von poolGrooveIds/listGrooves gegen einen Bestands-
  // Pool-Block einfrieren. Reihenfolge, Ids und alle gelesenen Felder sind
  // EXAKT festgeschrieben — eine 5b-Aenderung, die Bestands-Eintraege
  // anders parst oder umordnet, bricht hier sofort.
  it("(a) poolGrooveIds liefert unveraenderte Ids in Dokumentreihenfolge", () => {
    expect(poolGrooveIds(POOL_MULTI)).toStrictEqual(["4", "9"]);
  });

  it("(a) listGrooves liefert unveraenderte Eintraege (vollstaendig eingefroren)", () => {
    expect(listGrooves(POOL_MULTI)).toStrictEqual([
      {
        id: "4",
        name: "Swing 16ths 66",
        Grid: "3",
        QuantizationAmount: "0",
        TimingAmount: "100",
        RandomAmount: "0",
        VelocityAmount: "0",
      },
      {
        id: "9",
        name: "MPC 8-Swing",
        Grid: "2",
        QuantizationAmount: "0",
        TimingAmount: "62",
        RandomAmount: "0",
        VelocityAmount: "0",
      },
    ]);
  });

  // (b) Kontroll-Invariante fuer spaetere Mitigation-B-Beweise: ein
  // Set-XML, das KEINEN Import durchlaeuft, bleibt durch einen No-Op-Pfad
  // byte-identisch. listGrooves/poolGrooveIds sind reine Leser und duerfen
  // den Eingabe-String niemals mutieren — das friert die Voraussetzung
  // ein, gegen die 5b spaeter "alles ausser <GroovePool> byte-identisch"
  // beweist.
  it("(b) No-Op-Pfad: Lesen mutiert das Set-XML nicht (byte-identisch)", () => {
    const SET =
      '<?xml version="1.0" encoding="UTF-8"?><Ableton><LiveSet>' +
      POOL_MULTI +
      '<Tracks><MidiTrack Id="1"><Name Value="T" /></MidiTrack></Tracks>' +
      "</LiveSet></Ableton>";
    const before = SET;

    // Read-only Pfad (= No-Op bzgl. Set-Bytes).
    poolGrooveIds(SET);
    listGrooves(SET);

    expect(SET).toBe(before);
    // Bytes ausserhalb des GroovePool unveraendert (Kontroll-Invariante).
    const poolRe = /<GroovePool>[^]*?<\/GroovePool>/;

    expect(SET.replace(poolRe, "")).toBe(before.replace(poolRe, ""));
  });

  // (c) Kuenftiger 5b-Vertrag — als it.todo skizziert. Knoten-Form und
  // Id-Regel sind bis zur G5b-Fixture (Task 0, User-gated) UNBEKANNT,
  // daher KEINE konkreten Asserts/Annahmen, nur die Vertragspunkte.
  it.todo(
    "(c) 5b: 'groove import' legt einen neuen <Groove>-Pool-Eintrag an (Knoten-Form aus G5b-Fixture)",
  );
  it.todo(
    "(c) 5b: vergebene Groove-Id ist kollisionsfrei ggü. poolGrooveIds (Id-Regel aus G5b-Fixture)",
  );
  it.todo(
    "(c) 5b: GroovePool-fremde Bytes nach Import byte-identisch (Mitigation-B gegen G5b-.als-Nachher)",
  );
});
