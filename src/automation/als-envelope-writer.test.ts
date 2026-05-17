// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { buildEnvelopeXml, injectClipEnvelope, locateClipBlock } from "./als-envelope-writer.ts";

const FIX = `<Ableton><Tracks><MidiTrack Id="18"><Name><UserName Value="Spike Instr" /></Name><DeviceChain><Devices><Operator Id="0"><Frequency><Manual Value="12000" /><AutomationTarget Id="23005"><LockEnvelope Value="0" /></AutomationTarget></Frequency></Operator></Devices></DeviceChain><ClipSlotList><ClipSlot><ClipSlot Id="0"><Value><MidiClip Id="0" Time="0"><CurrentStart Value="0" /><Name Value="Spike Test" /><Envelopes><Envelopes /></Envelopes><Disabled Value="false" /></MidiClip></Value></ClipSlot></ClipSlot></ClipSlotList></MidiTrack></Tracks></Ableton>`;

const TWO = `<Ableton><Tracks><MidiTrack Id="1"><ClipSlotList>`+
  `<MidiClip Id="0"><Name Value="Other" /><Envelopes><Envelopes /></Envelopes></MidiClip>`+
  `<MidiClip Id="1"><Name Value="Target" /><Envelopes><Envelopes /></Envelopes></MidiClip>`+
  `</ClipSlotList></MidiTrack></Tracks></Ableton>`;

describe("locateClipBlock", () => {
  it("gibt korrekte start/end-Indizes zurueck", () => {
    const loc = locateClipBlock(FIX, "Spike Test");
    const clipTag = '<MidiClip Id="0"';

    expect(FIX.indexOf(clipTag)).toBe(loc.start);
    expect(FIX.slice(loc.start, loc.end)).toBe(loc.block);
    expect(loc.block).toContain('<Name Value="Spike Test" />');
  });

  it("block ist exakt xml.slice(start, end)", () => {
    const loc = locateClipBlock(TWO, "Target");

    expect(TWO.slice(loc.start, loc.end)).toBe(loc.block);
    expect(loc.block).toContain('<Name Value="Target" />');
    expect(loc.block).not.toContain('<Name Value="Other" />');
  });

  it("wirft bei unbekanntem Clip", () => {
    expect(() => locateClipBlock(FIX, "NichtVorhanden")).toThrow(/nicht gefunden/);
  });

  it("trifft den ersten Clip wenn beide denselben Namen haetten", () => {
    const dup = `<Ableton>`+
      `<MidiClip Id="0"><Name Value="Dup" /><Envelopes><Envelopes /></Envelopes></MidiClip>`+
      `<MidiClip Id="1"><Name Value="Dup" /><Envelopes><Envelopes /></Envelopes></MidiClip>`+
      `</Ableton>`;
    const loc = locateClipBlock(dup, "Dup");

    expect(loc.block).toContain('Id="0"');
  });
});

describe("buildEnvelopeXml", () => {
  it("baut AutomationEnvelope mit PointeeId und FloatEvents", () => {
    const s = buildEnvelopeXml(23005, [ { time: 0, value: 200 }, { time: 2, value: 8000 } ]);

    expect(s).toContain('<PointeeId Value="23005" />');
    expect(s).toContain('<FloatEvent Id="0" Time="0" Value="200" />');
    expect(s).toContain('<FloatEvent Id="1" Time="2" Value="8000" />');
    expect(s.startsWith("<AutomationEnvelope")).toBe(true);
    expect(s).toContain("<IsTransformPending Value=\"false\" />");
  });

  it("rendert kleine/grosse Floats ohne Sci-Notation", () => {
    const s = buildEnvelopeXml(1, [ { time: 0.0000001, value: 1e21 }, { time: 0.30000001, value: 745.5 } ]);

    expect(s).not.toMatch(/[Ee][+-]?\d/);
    expect(s).toContain('Time="0.0000001"');
    expect(s).toContain('Value="745.5"');
  });
});

describe("injectClipEnvelope", () => {
  it("ersetzt leeres Envelopes im Ziel-Clip (Doppel-Nesting)", () => {
    const breakpoints = [ { time: 0, value: 200 }, { time: 4, value: 400 } ];
    const out = injectClipEnvelope(FIX, "Spike Test", 23005, breakpoints);

    expect(out).toContain('<PointeeId Value="23005" />');
    expect(out).toContain('<FloatEvent Id="1" Time="4" Value="400" />');
    // Korrekte Doppel-Nesting: <Envelopes><Envelopes><AutomationEnvelope...
    expect(out).toMatch(/(?:<Envelopes>\s*){2}<AutomationEnvelope\b/);
    // ...und korrekter Abschluss: </AutomationEnvelope></Envelopes></Envelopes>
    expect(out).toMatch(/<\/AutomationEnvelope(?:>\s*<\/Envelopes){2}>/);
    // Literal proof: nur die exakte empty-envelopes-Stelle wurde ersetzt, alles andere byte-identisch
    const producedEnvelopes = `<Envelopes>${buildEnvelopeXml(23005, breakpoints)}</Envelopes>`;
    const expected = FIX.replace("<Envelopes />", producedEnvelopes);

    expect(out).toBe(expected);
  });

  it("behaelt aeussere Envelopes-Huelle (Ableton-Nesting Regression)", () => {
    const breakpoints = [ { time: 0, value: 100 } ];
    const out = injectClipEnvelope(FIX, "Spike Test", 23005, breakpoints);
    // Clip-Block isolieren
    const clipLoc = locateClipBlock(out, "Spike Test");
    const clipBlock = clipLoc.block;

    // Genau 2 oeffnende <Envelopes>-Tags im Clip
    const openCount = (clipBlock.match(/<Envelopes>/g) ?? []).length;

    expect(openCount).toBe(2);
    // Genau eine <AutomationEnvelope
    expect((clipBlock.match(/<AutomationEnvelope/g) ?? [])).toHaveLength(1);
    // Kein verbleibender self-closing <Envelopes />
    expect(clipBlock).not.toMatch(/<Envelopes\s*\/>/);
    // Doppelter Abschluss
    expect(clipBlock).toMatch(/<\/Envelopes>\s*<\/Envelopes>/);
  });

  it("modifiziert nur den Ziel-Clip, andere Clips byte-identisch", () => {
    const out = injectClipEnvelope(TWO, "Target", 42, [{ time: 0, value: 1 }]);

    // 'Other'-Clip unveraendert (enthaelt noch <Envelopes><Envelopes />)
    expect(out).toContain('<MidiClip Id="0"><Name Value="Other" /><Envelopes><Envelopes /></Envelopes></MidiClip>');
    // 'Target'-Clip hat jetzt Doppel-Nesting mit Envelope
    expect(out).toMatch(/<MidiClip Id="1"><Name Value="Target" \/(?:><Envelopes){2}><AutomationEnvelope/);
    // exakt eine verbleibende empty-envelopes-Stelle (im Other-Clip)
    expect((out.match(/<Envelopes \/>/g) ?? [])).toHaveLength(1);
  });

  it("wirft bei unbekanntem Clip", () => {
    expect(() => injectClipEnvelope(FIX, "Nope", 1, [{ time: 0, value: 1 }])).toThrow(/nicht gefunden/);
  });
  it("wirft wenn Clip keine leere Envelopes-Sektion hat", () => {
    const filled = FIX.replace("<Envelopes><Envelopes /></Envelopes>", "<Envelopes><AutomationEnvelope/></Envelopes>");

    expect(() => injectClipEnvelope(filled, "Spike Test", 1, [{ time: 0, value: 1 }])).toThrow(/bereits|keine/);
  });
});
