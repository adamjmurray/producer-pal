// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  assertNoSlice6bInput,
  resolveMasterTempoTargetId,
  locateTempoEnvelopeEvents,
  injectTempoEnvelope,
} from "#src/automation/master-timeline/als-tempo-automation.ts";

const BEFORE_ALS =
  "evals/live-sets/basic-midi-4-track Project/basic-midi-4-track.als";

/**
 * Liest das echte Before-Set roh ein (gzip → XML), Single-Source der
 * Test-Literale (keine erfundenen Werte).
 * @returns Dekomprimierter `.als`-XML-String.
 */
function readBeforeXml(): string {
  return gunzipSync(readFileSync(BEFORE_ALS)).toString("utf8");
}

// Woertlich aus dem echten Set extrahiert (8 TABs <FloatEvent>, 7 TABs
// <Events>/</Events>; Manual-BPM dieses Sets = 120):
const EXPECTED_BEFORE_EVENTS =
  "\t\t\t\t\t\t\t<Events>\n" +
  '\t\t\t\t\t\t\t\t<FloatEvent Id="0" Time="-63072000" Value="120" />\n' +
  "\t\t\t\t\t\t\t</Events>";

const CURVE_TUPLE =
  'CurveControl1X="0" CurveControl1Y="1" CurveControl2X="0" CurveControl2Y="1"';

describe("Slice-6b-Hartsperre", () => {
  it("wirft bei Time-Signature-Eingabe mit 'Slice 6b' im Text", () => {
    expect(() => assertNoSlice6bInput({ timeSignature: "3/4" })).toThrow(
      /Slice 6b/,
    );
  });
  it("wirft bei Curve-Flag-Eingabe mit 'Slice 6b' im Text", () => {
    expect(() => assertNoSlice6bInput({ curve: true })).toThrow(/Slice 6b/);
  });
  it("passiert bei reiner linearer Tempo-Eingabe", () => {
    expect(() => assertNoSlice6bInput({})).not.toThrow();
  });
});

describe("G6-gated: byte-belegte Master-Tempo-Automation", () => {
  it("resolveMasterTempoTargetId liefert die Tempo-PointeeId 8", () => {
    expect(resolveMasterTempoTargetId(readBeforeXml())).toBe("8");
  });

  it("locateTempoEnvelopeEvents findet den Events-Block der PointeeId-8-Envelope", () => {
    const xml = readBeforeXml();
    const { start, end, block } = locateTempoEnvelopeEvents(xml);

    expect(block).toBe(EXPECTED_BEFORE_EVENTS);
    expect(xml.slice(start, end)).toBe(EXPECTED_BEFORE_EVENTS);
    expect(block).toContain(
      '<FloatEvent Id="0" Time="-63072000" Value="120" />',
    );
  });

  it("locateTempoEnvelopeEvents wirft deskriptiv bei XML ohne MainTrack", () => {
    expect(() => locateTempoEnvelopeEvents("<Ableton></Ableton>")).toThrow(
      /MainTrack/,
    );
  });

  it("injectTempoEnvelope erzeugt byte-treuen AFTER-Events-Block", () => {
    const xml = readBeforeXml();
    const out = injectTempoEnvelope(xml, [
      { time: 0, value: 120 },
      { time: 16, value: 140 },
      { time: 32, value: 100 },
    ]);
    const expectedAfter =
      "\t\t\t\t\t\t\t<Events>\n" +
      '\t\t\t\t\t\t\t\t<FloatEvent Id="0" Time="-63072000" Value="120" />\n' +
      '\t\t\t\t\t\t\t\t<FloatEvent Id="1" Time="0" Value="120" />\n' +
      '\t\t\t\t\t\t\t\t<FloatEvent Id="2" Time="16" Value="140" />\n' +
      '\t\t\t\t\t\t\t\t<FloatEvent Id="3" Time="32" Value="100" />\n' +
      "\t\t\t\t\t\t\t</Events>";

    expect(out).toContain(expectedAfter);
  });

  it("injectTempoEnvelope ändert nur den Events-Block (Mitigation-B)", () => {
    const xml = readBeforeXml();
    const { start, end } = locateTempoEnvelopeEvents(xml);
    const out = injectTempoEnvelope(xml, [
      { time: 0, value: 120 },
      { time: 16, value: 140 },
      { time: 32, value: 100 },
    ]);
    const newEventsLen = out.length - (xml.length - (end - start));

    expect(out.slice(0, start)).toBe(xml.slice(0, start));
    expect(out.slice(start + newEventsLen)).toBe(xml.slice(end));
  });

  it("injectTempoEnvelope: curve:true erzeugt Tupel und wirft NICHT (Slice 6c)", () => {
    const xml = readBeforeXml();

    expect(() =>
      injectTempoEnvelope(xml, [
        { time: 0, value: 120, curve: true },
        { time: 8, value: 130 },
      ]),
    ).not.toThrow();
    const out = injectTempoEnvelope(xml, [
      { time: 0, value: 120, curve: true },
      { time: 8, value: 130 },
    ]);

    expect(out).toContain(
      `<FloatEvent Id="1" Time="0" Value="120" ${CURVE_TUPLE} />`,
    );
  });

  it("injectTempoEnvelope wirft bei leerer Breakpoint-Liste", () => {
    expect(() => injectTempoEnvelope(readBeforeXml(), [])).toThrow(
      /mindestens 1 Breakpoint/,
    );
  });

  it("resolveMasterTempoTargetId wirft bei MainTrack ohne Tempo-AutomationTarget", () => {
    expect(() =>
      resolveMasterTempoTargetId('<MainTrack X="1"></MainTrack>'),
    ).toThrow(/Tempo/);
  });

  it("resolveMasterTempoTargetId wirft bei fehlendem MainTrack", () => {
    expect(() => resolveMasterTempoTargetId("<Ableton/>")).toThrow(/MainTrack/);
  });

  it("locateTempoEnvelopeEvents wirft bei Tempo-Id ohne passende PointeeId-Envelope", () => {
    const xml =
      '<MainTrack X="1"><Tempo><AutomationTarget Id="8" /></Tempo></MainTrack>';

    expect(() => locateTempoEnvelopeEvents(xml)).toThrow(/PointeeId 8/);
  });

  it("locateTempoEnvelopeEvents wirft bei PointeeId-Envelope ohne <Events>", () => {
    const xml =
      '<MainTrack X="1"><Tempo><AutomationTarget Id="8" /></Tempo>' +
      '<PointeeId Value="8" /></MainTrack>';

    expect(() => locateTempoEnvelopeEvents(xml)).toThrow(/ohne <Events>/);
  });

  it("injectTempoEnvelope: fmt Float- und Exponent-Pfad byte-korrekt", () => {
    const out = injectTempoEnvelope(readBeforeXml(), [
      { time: 1e21, value: 140.25 },
    ]);

    // Float-Pfad: 140.25 (Trailing-Zero-Trim), Exponent-Pfad: 1e21 → BigInt.
    expect(out).toContain(
      '<FloatEvent Id="1" Time="1000000000000000000000" Value="140.25" />',
    );
  });
});

describe("Slice-6c: gekrümmte Tempo-Segmente", () => {
  it("curve-Flag hängt das Slice-2b-Tupel an genau das Segment-Start-FloatEvent", () => {
    const out = injectTempoEnvelope(readBeforeXml(), [
      { time: 0, value: 120 },
      { time: 16, value: 140, curve: true },
      { time: 32, value: 100 },
    ]);
    const expected =
      "\t\t\t\t\t\t\t<Events>\n" +
      '\t\t\t\t\t\t\t\t<FloatEvent Id="0" Time="-63072000" Value="120" />\n' +
      '\t\t\t\t\t\t\t\t<FloatEvent Id="1" Time="0" Value="120" />\n' +
      `\t\t\t\t\t\t\t\t<FloatEvent Id="2" Time="16" Value="140" ${CURVE_TUPLE} />\n` +
      '\t\t\t\t\t\t\t\t<FloatEvent Id="3" Time="32" Value="100" />\n' +
      "\t\t\t\t\t\t\t</Events>";

    expect(out).toContain(expected);
  });

  it("Anker-FloatEvent (Id=0) trägt NIE das Tupel, auch wenn bp[0].curve", () => {
    const out = injectTempoEnvelope(readBeforeXml(), [
      { time: 0, value: 120, curve: true },
      { time: 16, value: 140 },
    ]);

    expect(out).toContain('<FloatEvent Id="0" Time="-63072000" Value="120" />');
    expect(out).toContain(
      `<FloatEvent Id="1" Time="0" Value="120" ${CURVE_TUPLE} />`,
    );
  });

  it("mehrere ~-Segmente: jedes geflaggte FloatEvent trägt das Tupel", () => {
    const out = injectTempoEnvelope(readBeforeXml(), [
      { time: 0, value: 120, curve: true },
      { time: 8, value: 130, curve: true },
      { time: 16, value: 140 },
    ]);

    expect([
      ...out.matchAll(
        new RegExp(CURVE_TUPLE.replaceAll(/[$()*+.?[\\\]^{|}]/g, "\\$&"), "g"),
      ),
    ]).toHaveLength(2);
  });

  it("ohne curve byte-identisch zum Slice-6-Linearpfad (Regressionsbeweis)", () => {
    const bps = [
      { time: 0, value: 120 },
      { time: 16, value: 140 },
      { time: 32, value: 100 },
    ];
    const out = injectTempoEnvelope(readBeforeXml(), bps);

    expect(out).not.toContain("CurveControl");
    expect(out).toContain(
      "\t\t\t\t\t\t\t<Events>\n" +
        '\t\t\t\t\t\t\t\t<FloatEvent Id="0" Time="-63072000" Value="120" />\n' +
        '\t\t\t\t\t\t\t\t<FloatEvent Id="1" Time="0" Value="120" />\n' +
        '\t\t\t\t\t\t\t\t<FloatEvent Id="2" Time="16" Value="140" />\n' +
        '\t\t\t\t\t\t\t\t<FloatEvent Id="3" Time="32" Value="100" />\n' +
        "\t\t\t\t\t\t\t</Events>",
    );
  });

  it("curve-Pfad ändert nur den Events-Block (Mitigation-B)", () => {
    const xml = readBeforeXml();
    const { start, end } = locateTempoEnvelopeEvents(xml);
    const out = injectTempoEnvelope(xml, [
      { time: 0, value: 120 },
      { time: 16, value: 140, curve: true },
    ]);
    const newLen = out.length - (xml.length - (end - start));

    expect(out.slice(0, start)).toBe(xml.slice(0, start));
    expect(out.slice(start + newLen)).toBe(xml.slice(end));
  });
});
