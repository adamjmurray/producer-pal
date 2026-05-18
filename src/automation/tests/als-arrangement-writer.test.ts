// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as fs from "node:fs";
import { describe, it, expect } from "vitest";
import {
  buildArrangementEnvelopeXml,
  injectArrangementEnvelope,
  locateTrackAutomationBlock,
} from "../als-arrangement-writer.ts";
import { readAls } from "#src/automation/als-file.ts";

const FIXTURE_PATH =
  "/Users/macuser/Desktop/AIbleton/docs/superpowers/fixtures/ableton12-arrangement-envelope-groundtruth.xml";

// Inline track with the EMPTY placeholder (Color -> AutomationEnvelopes -> TrackGroupId).
const TRACK_XML =
  `<Ableton><LiveSet><Tracks>` +
  `<MidiTrack Id="7"><Name><EffectiveName Value="Lead" /></Name>` +
  `<Color Value="12" />` +
  `<AutomationEnvelopes>\n\t\t\t\t\t<Envelopes />\n\t\t\t\t</AutomationEnvelopes>` +
  `<TrackGroupId Value="-1" /><DeviceChain /></MidiTrack>` +
  `<AudioTrack Id="9"><Name><EffectiveName Value="Drums" /></Name>` +
  `<Color Value="3" />` +
  `<AutomationEnvelopes>\n\t\t\t\t\t<Envelopes />\n\t\t\t\t</AutomationEnvelopes>` +
  `<TrackGroupId Value="-1" /></AudioTrack>` +
  `</Tracks></LiveSet></Ableton>`;

describe("buildArrangementEnvelopeXml", () => {
  const bps = [
    { time: 10, value: 1 },
    { time: 22, value: 0.146 },
  ];

  it("erzeugt AutomationEnvelope Id=0 mit PointeeId, Anchor und sequenziellen Events", () => {
    const s = buildArrangementEnvelopeXml(15838, [
      { time: 10, value: 0.5 },
      { time: 22, value: 0.7 },
    ]);

    expect(s).toContain('<AutomationEnvelope Id="0">');
    expect(s).not.toContain("ClipEnvelope");
    expect(s).toContain('<PointeeId Value="15838" />');
    expect(s).toContain('<FloatEvent Id="0" Time="-63072000" Value="0.5" />');
    expect(s).toContain('<FloatEvent Id="1" Time="10" Value="0.5" />');
    expect(s).toContain('<FloatEvent Id="2" Time="22" Value="0.7" />');
    expect(s).toContain("<AutomationTransformViewState>");
    expect(s).toContain('<IsTransformPending Value="false" />');
    expect(s).toContain("<TimeAndValueTransforms />");
  });

  it("enthaelt KEIN LoopSlot und KEIN ScrollerTimePreserver (Track-Ebene)", () => {
    const s = buildArrangementEnvelopeXml(22677, bps);

    expect(s).not.toContain("<LoopSlot");
    expect(s).not.toContain("<ScrollerTimePreserver");
  });

  it("wirft bei leeren Breakpoints", () => {
    expect(() => buildArrangementEnvelopeXml(1, [])).toThrow(
      /mindestens 1 Breakpoint/,
    );
  });

  it("rendert NaN-Werte ohne Dezimalpunkt-Trim (kein '.'-Zweig in fmt)", () => {
    // NaN ist keine Ganzzahl -> toFixed(12) = "NaN" (kein "."), der
    // includes(".")-Trim-Zweig wird mit false durchlaufen.
    const s = buildArrangementEnvelopeXml(1, [
      { time: Number.NaN, value: Number.NaN },
    ]);

    expect(s).toContain('Time="NaN"');
    expect(s).toContain('Value="NaN"');
  });

  it("rendert grosse ganzzahlige Werte ohne Exponent (BigInt-Pfad in fmt)", () => {
    // 1e21 ist eine Ganzzahl, deren String(...) "1e+21" liefert -> BigInt-Zweig.
    const s = buildArrangementEnvelopeXml(1, [{ time: 1e21, value: 1e21 }]);

    expect(s).toContain('Value="1000000000000000000000"');
    expect(s).toContain('Time="1000000000000000000000"');
    expect(s).not.toMatch(/[Ee][+-]?\d/);
  });

  it("Scaffold ist byte-gleich zur Ground-Truth-Fixture (FloatEvents entfernt)", () => {
    const fixture = fs.readFileSync(FIXTURE_PATH, "utf8");
    const lines = fixture.split("\n");
    // Erstes <AutomationEnvelope Id="0">..</AutomationEnvelope> aus der Fixture extrahieren.
    const startIdx = lines.findIndex((l) =>
      l.includes('<AutomationEnvelope Id="0">'),
    );
    const endIdx = lines.findIndex(
      (l, i) => i > startIdx && l.includes("</AutomationEnvelope>"),
    );
    const fixtureBlock = lines.slice(startIdx, endIdx + 1).join("\n");

    // Beide Bloecke: alle FloatEvent-Zeilen entfernen -> reines Scaffold.
    const stripFloatEvents = (s: string): string =>
      s
        .split("\n")
        .filter((l) => !l.trim().startsWith("<FloatEvent"))
        .join("\n");

    const fixtureScaffold = stripFloatEvents(fixtureBlock);
    const ours = buildArrangementEnvelopeXml(22677, [{ time: 10, value: 1 }]);
    const oursScaffold = stripFloatEvents(ours);

    expect(oursScaffold).toBe(fixtureScaffold);
  });
});

describe("locateTrackAutomationBlock", () => {
  it("findet den leeren Platzhalter im benannten Track", () => {
    const loc = locateTrackAutomationBlock(TRACK_XML, "Lead");

    expect(loc.block).toContain("<AutomationEnvelopes>");
    expect(loc.block).toContain("<Envelopes />");
    expect(TRACK_XML.slice(loc.start, loc.end)).toBe(loc.block);
  });

  it("wirft bei unbekanntem Track", () => {
    expect(() => locateTrackAutomationBlock(TRACK_XML, "Nope")).toThrow(
      /nicht gefunden/,
    );
  });

  it("wirft wenn Platzhalter bereits gefuellt ist", () => {
    const filled = TRACK_XML.replace(
      `<AutomationEnvelopes>\n\t\t\t\t\t<Envelopes />\n\t\t\t\t</AutomationEnvelopes>`,
      `<AutomationEnvelopes><Envelopes><AutomationEnvelope Id="0"></AutomationEnvelope></Envelopes></AutomationEnvelopes>`,
    );

    expect(() => locateTrackAutomationBlock(filled, "Lead")).toThrow(
      /bereits|kein leerer/,
    );
  });
});

describe("injectArrangementEnvelope", () => {
  const bps = [
    { time: 10, value: 1 },
    { time: 22, value: 0.146 },
  ];

  it("ersetzt nur den Platzhalter, Bytes davor/danach byte-identisch", () => {
    const loc = locateTrackAutomationBlock(TRACK_XML, "Lead");
    const out = injectArrangementEnvelope(TRACK_XML, "Lead", 15838, bps);

    expect(TRACK_XML.slice(0, loc.start)).toBe(out.slice(0, loc.start));
    const tailLen = TRACK_XML.length - loc.end;

    expect(TRACK_XML.slice(loc.end)).toBe(out.slice(out.length - tailLen));
    // Lead-Platzhalter ersetzt, Drums-Platzhalter (unveraendert) bleibt.
    expect(out.slice(0, loc.start)).not.toContain(
      `<AutomationEnvelope Id="0">`,
    );
    expect(out).toContain("<AutomationEnvelope");
    expect(out).toContain('<PointeeId Value="15838" />');
    // Genau ein <Envelopes /> uebrig (Drums-Track, unberuehrt).
    expect(out.match(/<Envelopes \/>/g) ?? []).toHaveLength(1);
  });

  it("aeusserer AutomationEnvelopes-Wrapper bleibt pro Track genau einmal", () => {
    const out = injectArrangementEnvelope(TRACK_XML, "Lead", 15838, bps);
    // Lead-Track-Slice manuell extrahieren (Platzhalter ist jetzt gefuellt,
    // locateTrackAutomationBlock findet nur LEERE Platzhalter).
    const ls = out.indexOf('<MidiTrack Id="7">');
    const le = out.indexOf("</MidiTrack>") + "</MidiTrack>".length;
    const leadBlock = out.slice(ls, le);

    expect(leadBlock.match(/<AutomationEnvelopes>/g) ?? []).toHaveLength(1);
    expect(leadBlock.match(/<\/AutomationEnvelopes>/g) ?? []).toHaveLength(1);
    expect(leadBlock).toContain('<AutomationEnvelope Id="0">');
    expect(leadBlock).not.toContain("<Envelopes />");
  });

  it("modifiziert nur den Ziel-Track, andere Tracks byte-identisch", () => {
    const out = injectArrangementEnvelope(TRACK_XML, "Lead", 15838, bps);

    expect(out).toContain(
      `<AudioTrack Id="9"><Name><EffectiveName Value="Drums" /></Name>` +
        `<Color Value="3" />` +
        `<AutomationEnvelopes>\n\t\t\t\t\t<Envelopes />\n\t\t\t\t</AutomationEnvelopes>`,
    );
  });

  it("Integration: echte leere .als, Ziel-Track gefuellt, Rest unveraendert", () => {
    const path =
      "/Users/macuser/Desktop/AIbleton/producer-pal/evals/live-sets/basic-midi-4-track Project/basic-midi-4-track.als";
    const xml = readAls(path);

    expect(/<Envelopes \/>/.test(xml)).toBe(true);
    const before = locateTrackAutomationBlock(xml, "Lead");

    const out = injectArrangementEnvelope(xml, "Lead", 15838, [
      { time: 0, value: 1 },
      { time: 16, value: 0.5 },
    ]);

    // Wohlgeformtheit: gleiche Anzahl oeffnender/schliessender AutomationEnvelopes.
    const open = (out.match(/<AutomationEnvelopes>/g) ?? []).length;
    const close = (out.match(/<\/AutomationEnvelopes>/g) ?? []).length;

    expect(open).toBe(close);

    // Ziel-Track ist jetzt gefuellt: an before.start steht nun statt des
    // leeren Platzhalters der populierte <AutomationEnvelopes>-Block.
    const filled = out.slice(
      before.start,
      out.length - (xml.length - before.end),
    );

    expect(filled).toContain("<AutomationEnvelope");
    expect(filled).toContain('<PointeeId Value="15838" />');
    expect(filled).not.toContain("<Envelopes />");

    // Bytes ausserhalb des Track-Automation-Blocks unveraendert.
    expect(xml.slice(0, before.start)).toBe(out.slice(0, before.start));
    const tail = xml.length - before.end;

    expect(xml.slice(before.end)).toBe(out.slice(out.length - tail));
  });
});

// Slice-2b Abwaertskompat-Regressionsnetz (fixture-frei).
// Friert den LINEAREN Writer-Output ein, BEVOR die Kurven-Kodierung (Plan
// T4) gebaut wird. Kontroll-/Charakterisierungstests; KEIN Produktivcode.
describe("buildArrangementEnvelopeXml — Slice-2b lineare Lane eingefroren", () => {
  // Erwarteter Bestands-Output fuer eine repraesentative lineare Lane.
  // Snapshot inline (kein zusaetzliches Fixture-File) — muss nach T4 fuer
  // den Pfad OHNE curve byte-identisch bleiben.
  const EXPECTED_LINEAR =
    '\t\t\t\t\t\t<AutomationEnvelope Id="0">\n' +
    "\t\t\t\t\t\t\t<EnvelopeTarget>\n" +
    '\t\t\t\t\t\t\t\t<PointeeId Value="15838" />\n' +
    "\t\t\t\t\t\t\t</EnvelopeTarget>\n" +
    "\t\t\t\t\t\t\t<Automation>\n" +
    "\t\t\t\t\t\t\t\t<Events>\n" +
    '\t\t\t\t\t\t\t\t\t<FloatEvent Id="0" Time="-63072000" Value="200" />\n' +
    '\t\t\t\t\t\t\t\t\t<FloatEvent Id="1" Time="0" Value="200" />\n' +
    '\t\t\t\t\t\t\t\t\t<FloatEvent Id="2" Time="2" Value="8000" />\n' +
    '\t\t\t\t\t\t\t\t\t<FloatEvent Id="3" Time="4" Value="400" />\n' +
    "\t\t\t\t\t\t\t\t</Events>\n" +
    "\t\t\t\t\t\t\t\t<AutomationTransformViewState>\n" +
    '\t\t\t\t\t\t\t\t\t<IsTransformPending Value="false" />\n' +
    "\t\t\t\t\t\t\t\t\t<TimeAndValueTransforms />\n" +
    "\t\t\t\t\t\t\t\t</AutomationTransformViewState>\n" +
    "\t\t\t\t\t\t\t</Automation>\n" +
    "\t\t\t\t\t\t</AutomationEnvelope>";

  it("lineare Lane erzeugt byte-identischen Bestands-Output", () => {
    const out = buildArrangementEnvelopeXml(15838, [
      { time: 0, value: 200 },
      { time: 2, value: 8000 },
      { time: 4, value: 400 },
    ]);

    expect(out).toBe(EXPECTED_LINEAR);
  });

  it("Ist: curve-Feld am Breakpoint wird vom Writer aktuell IGNORIERT", () => {
    // Der Writer liest nur time/value. Ein vorhandenes curve-Feld erzeugt
    // KEINE zusaetzlichen Bytes -> Output identisch zur linearen Lane.
    // T4 aendert das bewusst (byte-belegte Kurven-Kodierung aus G2b).
    const withCurve = buildArrangementEnvelopeXml(15838, [
      { time: 0, value: 200, curve: 0.5 },
      { time: 2, value: 8000 },
      { time: 4, value: 400 },
    ]);

    expect(withCurve).toBe(EXPECTED_LINEAR);
  });
});

describe("als-arrangement-writer — Slice-2b kuenftige Kurven-Kodierung (it.todo)", () => {
  // Kodierungsform (Attribut/Element/Range) UNBEKANNT bis G2b.
  it.todo("Default linear: Output ohne curve byte-gleich zum Slice-2-Bestand");
  it.todo("gekruemmtes Segment erzeugt die byte-belegte G2b-Kodierung");
  it.todo("lineare Segmente in gemischter Lane bleiben unveraendert");
});
