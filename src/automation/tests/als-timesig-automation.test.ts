// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  resolveTimeSigTargetId,
  locateTimeSigEnvelopeEvents,
  injectTimeSigEnvelope,
  assertNoTimeSigCurve,
} from "#src/automation/master-timeline/als-timesig-automation.ts";

const BEFORE =
  "evals/live-sets/basic-midi-4-track Project/basic-midi-4-track.als";
const readXml = (): string => gunzipSync(readFileSync(BEFORE)).toString("utf8");

const EXPECTED_BEFORE_EVENTS =
  "\t\t\t\t\t\t\t<Events>\n" +
  '\t\t\t\t\t\t\t\t<EnumEvent Id="0" Time="-63072000" Value="201" />\n' +
  "\t\t\t\t\t\t\t</Events>";

describe("Slice-6b Time-Signature-Marker", () => {
  it("resolveTimeSigTargetId liefert die TimeSignature-PointeeId 10", () => {
    expect(resolveTimeSigTargetId(readXml())).toBe("10");
  });

  it("locateTimeSigEnvelopeEvents findet den PointeeId-10-Events-Block", () => {
    const xml = readXml();
    const { start, end, block } = locateTimeSigEnvelopeEvents(xml);

    expect(block).toBe(EXPECTED_BEFORE_EVENTS);
    expect(xml.slice(start, end)).toBe(EXPECTED_BEFORE_EVENTS);
  });

  it("locateTimeSigEnvelopeEvents wirft bei XML ohne MainTrack", () => {
    expect(() => locateTimeSigEnvelopeEvents("<Ableton/>")).toThrow(
      /MainTrack/,
    );
  });

  it("injectTimeSigEnvelope erzeugt byte-treuen AFTER-Events-Block", () => {
    const out = injectTimeSigEnvelope(readXml(), [
      { time: 0, value: 201 },
      { time: 16, value: 193 },
      { time: 32, value: 201 },
    ]);
    const expected =
      "\t\t\t\t\t\t\t<Events>\n" +
      '\t\t\t\t\t\t\t\t<EnumEvent Id="0" Time="-63072000" Value="201" />\n' +
      '\t\t\t\t\t\t\t\t<EnumEvent Id="1" Time="0" Value="201" />\n' +
      '\t\t\t\t\t\t\t\t<EnumEvent Id="2" Time="16" Value="193" />\n' +
      '\t\t\t\t\t\t\t\t<EnumEvent Id="3" Time="32" Value="201" />\n' +
      "\t\t\t\t\t\t\t</Events>";

    expect(out).toContain(expected);
  });

  it("injectTimeSigEnvelope ändert nur den Events-Block (Mitigation-B)", () => {
    const xml = readXml();
    const { start, end } = locateTimeSigEnvelopeEvents(xml);
    const out = injectTimeSigEnvelope(xml, [{ time: 0, value: 201 }]);
    const newLen = out.length - (xml.length - (end - start));

    expect(out.slice(0, start)).toBe(xml.slice(0, start));
    expect(out.slice(start + newLen)).toBe(xml.slice(end));
  });

  it("injectTimeSigEnvelope wirft bei nicht-ganzzahligem Value", () => {
    expect(() =>
      injectTimeSigEnvelope(readXml(), [{ time: 0, value: 4.5 }]),
    ).toThrow(/Integer|ganzzahlig/);
  });

  it("injectTimeSigEnvelope wirft bei leerer Liste", () => {
    expect(() => injectTimeSigEnvelope(readXml(), [])).toThrow(/mindestens 1/);
  });

  it("assertNoTimeSigCurve wirft bei curve mit 'Slice 6c'", () => {
    expect(() => assertNoTimeSigCurve({ curve: true })).toThrow(/Slice 6c/);
  });

  it("assertNoTimeSigCurve passiert ohne curve", () => {
    expect(() => assertNoTimeSigCurve({})).not.toThrow();
  });

  it("resolveTimeSigTargetId wirft bei MainTrack ohne TimeSignature-Target", () => {
    expect(() =>
      resolveTimeSigTargetId('<MainTrack X="1"></MainTrack>'),
    ).toThrow(/TimeSignature/);
  });

  it("resolveTimeSigTargetId wirft bei fehlendem MainTrack", () => {
    expect(() => resolveTimeSigTargetId("<Ableton/>")).toThrow(/MainTrack/);
  });

  it("locateTimeSigEnvelopeEvents wirft bei Target-Id ohne passende PointeeId-Envelope", () => {
    const xml =
      '<MainTrack X="1"><TimeSignature><AutomationTarget Id="10" />' +
      "</TimeSignature></MainTrack>";

    expect(() => locateTimeSigEnvelopeEvents(xml)).toThrow(/PointeeId 10/);
  });

  it("locateTimeSigEnvelopeEvents wirft bei PointeeId-Envelope ohne <Events>", () => {
    const xml =
      '<MainTrack X="1"><TimeSignature><AutomationTarget Id="10" />' +
      '</TimeSignature><PointeeId Value="10" /></MainTrack>';

    expect(() => locateTimeSigEnvelopeEvents(xml)).toThrow(/ohne <Events>/);
  });

  it("injectTimeSigEnvelope: fmtTime Float- und Exponent-Pfad byte-korrekt", () => {
    const out = injectTimeSigEnvelope(readXml(), [
      { time: 1e21, value: 201 },
      { time: 4.5, value: 193 },
    ]);

    // Exponent-Pfad: 1e21 → BigInt-String; Float-Pfad: 4.5 (Value bleibt Int).
    expect(out).toContain(
      '<EnumEvent Id="1" Time="1000000000000000000000" Value="201" />',
    );
    expect(out).toContain('<EnumEvent Id="2" Time="4.5" Value="193" />');
  });
});

describe("G6b'-gated: Enum-Namen-Mapping (Roh-Int funktioniert ohne)", () => {
  // Recon-Gate G6b' offen: Numerator/Denominator↔Enum-Int byte-ableiten
  // aus User-Fixture (mehrere Taktarten), Slice-3-T5/G3'-Muster.
  it.todo("resolveTimeSigName mappt '3/4' → byte-belegten Enum-Int");
  it.todo("injectTimeSigEnvelope akzeptiert '4/4'-Namens-Notation");
});
