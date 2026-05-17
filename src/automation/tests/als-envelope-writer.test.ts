// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  buildEnvelopeXml,
  injectClipEnvelope,
  locateClipBlock,
} from "../als-envelope-writer.ts";

const FIX = `<Ableton><Tracks><MidiTrack Id="18"><Name><UserName Value="Spike Instr" /></Name><DeviceChain><Devices><Operator Id="0"><Frequency><Manual Value="12000" /><AutomationTarget Id="23005"><LockEnvelope Value="0" /></AutomationTarget></Frequency></Operator></Devices></DeviceChain><ClipSlotList><ClipSlot><ClipSlot Id="0"><Value><MidiClip Id="0" Time="0"><CurrentStart Value="0" /><Name Value="Spike Test" /><Envelopes><Envelopes /></Envelopes><Disabled Value="false" /></MidiClip></Value></ClipSlot></ClipSlot></ClipSlotList></MidiTrack></Tracks></Ableton>`;

const TWO =
  `<Ableton><Tracks><MidiTrack Id="1"><ClipSlotList>` +
  `<MidiClip Id="0"><Name Value="Other" /><Envelopes><Envelopes /></Envelopes></MidiClip>` +
  `<MidiClip Id="1"><Name Value="Target" /><Envelopes><Envelopes /></Envelopes></MidiClip>` +
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
    expect(() => locateClipBlock(FIX, "NichtVorhanden")).toThrow(
      /nicht gefunden/,
    );
  });

  it("trifft den ersten Clip wenn beide denselben Namen haetten", () => {
    const dup =
      `<Ableton>` +
      `<MidiClip Id="0"><Name Value="Dup" /><Envelopes><Envelopes /></Envelopes></MidiClip>` +
      `<MidiClip Id="1"><Name Value="Dup" /><Envelopes><Envelopes /></Envelopes></MidiClip>` +
      `</Ableton>`;
    const loc = locateClipBlock(dup, "Dup");

    expect(loc.block).toContain('Id="0"');
  });

  it("REGRESSION: locateClipBlock findet Session-MidiClip per Name byte-stabil", () => {
    const xml =
      '<MidiClip Time="0"><Name Value="C1" /><Color Value="1" /></MidiClip>' +
      '<MidiClip Time="0"><Name Value="ZielClip" /><Color Value="2" /></MidiClip>';
    const loc = locateClipBlock(xml, "ZielClip");

    expect(loc.block).toContain('<Name Value="ZielClip" />');
    expect(xml.slice(loc.start, loc.end)).toBe(loc.block);
  });

  it("locateClipBlock findet AudioClip per Name", () => {
    const xml = '<AudioClip Time="8"><Name Value="AC" /><X /></AudioClip>';

    expect(locateClipBlock(xml, "AC").block).toContain('<Name Value="AC" />');
  });

  it("locateClipBlock findet Arrangement-MidiClip mit Time-Attribut", () => {
    const xml =
      '<MidiClip Time="0"><Name Value="S" /></MidiClip>' +
      '<MidiClip Time="16"><Name Value="ArrClip" /></MidiClip>';
    const loc = locateClipBlock(xml, "ArrClip");

    expect(loc.block).toContain('Time="16"');
    expect(loc.block).toContain('<Name Value="ArrClip" />');
  });

  it("lokalisiert gemischte MidiClips + AudioClip jeweils per Name vollstaendig", () => {
    const m1 =
      '<MidiClip Time="0"><Name Value="M1" /><Color Value="1" /></MidiClip>';
    const ac =
      '<AudioClip Time="4"><Name Value="A1" /><Sample Value="x" /></AudioClip>';
    const m2 =
      '<MidiClip Time="32"><Name Value="M2" /><Color Value="2" /></MidiClip>';
    const xml = `<Outer>${m1}${ac}${m2}</Outer>`;

    const l1 = locateClipBlock(xml, "M1");

    expect(l1.block).toBe(m1);
    expect(xml.slice(l1.start, l1.end)).toBe(l1.block);

    const la = locateClipBlock(xml, "A1");

    expect(la.block).toBe(ac);
    expect(xml.slice(la.start, la.end)).toBe(la.block);

    const l2 = locateClipBlock(xml, "M2");

    expect(l2.block).toBe(m2);
    expect(xml.slice(l2.start, l2.end)).toBe(l2.block);
  });

  it("wirft bei unbekanntem Clip-Namen (Negativfall, additiv)", () => {
    const xml =
      '<MidiClip Time="0"><Name Value="M1" /></MidiClip>' +
      '<AudioClip Time="8"><Name Value="A1" /></AudioClip>';

    expect(() => locateClipBlock(xml, "FehltGarantiert")).toThrow(
      /nicht gefunden/,
    );
  });
});

describe("buildEnvelopeXml", () => {
  it("baut ClipEnvelope mit PointeeId, Anchor-Event und FloatEvents", () => {
    const s = buildEnvelopeXml(23005, [
      { time: 0, value: 200 },
      { time: 2, value: 8000 },
    ]);

    // Must start with ClipEnvelope, NOT AutomationEnvelope
    expect(s.startsWith('<ClipEnvelope Id="0">')).toBe(true);
    expect(s).not.toContain("AutomationEnvelope");
    expect(s).toContain('<PointeeId Value="23005" />');
    // Anchor event: Id=0, Time=-63072000, Value = first breakpoint value
    expect(s).toContain('<FloatEvent Id="0" Time="-63072000" Value="200" />');
    // User breakpoints start at Id=1
    expect(s).toContain('<FloatEvent Id="1" Time="0" Value="200" />');
    expect(s).toContain('<FloatEvent Id="2" Time="2" Value="8000" />');
    expect(s).toContain('<IsTransformPending Value="false" />');
    // Must have LoopSlot and ScrollerTimePreserver
    expect(s).toContain("<LoopSlot><Value /></LoopSlot>");
    expect(s).toContain(
      '<ScrollerTimePreserver><LeftTime Value="0" /><RightTime Value="0" /></ScrollerTimePreserver>',
    );
  });

  it("rendert kleine/grosse Floats ohne Sci-Notation", () => {
    const s = buildEnvelopeXml(1, [
      { time: 0.0000001, value: 1e21 },
      { time: 0.30000001, value: 745.5 },
    ]);

    expect(s).not.toMatch(/[Ee][+-]?\d/);
    // Anchor at -63072000 with Value = first bp value (1e21, large int)
    expect(s).toContain('Time="-63072000"');
    // Real breakpoints
    expect(s).toContain('Time="0.0000001"');
    expect(s).toContain('Value="745.5"');
  });

  it("wirft bei leeren Breakpoints", () => {
    expect(() => buildEnvelopeXml(1, [])).toThrow(/mindestens 1 Breakpoint/);
  });
});

describe("injectClipEnvelope", () => {
  it("ersetzt leeres Envelopes im Ziel-Clip (Doppel-Nesting mit ClipEnvelope)", () => {
    const breakpoints = [
      { time: 0, value: 200 },
      { time: 4, value: 400 },
    ];
    const out = injectClipEnvelope(FIX, "Spike Test", 23005, breakpoints);

    expect(out).toContain('<PointeeId Value="23005" />');
    // Anchor at Id=0, user bps at Id=1+
    expect(out).toContain('<FloatEvent Id="0" Time="-63072000" Value="200" />');
    expect(out).toContain('<FloatEvent Id="2" Time="4" Value="400" />');
    // Correct double-nesting: <Envelopes><Envelopes><ClipEnvelope...
    expect(out).toMatch(/(?:<Envelopes>\s*){2}<ClipEnvelope\b/);
    // Correct closing: </ClipEnvelope></Envelopes></Envelopes>
    expect(out).toMatch(/<\/ClipEnvelope(?:>\s*<\/Envelopes){2}>/);
    // Literal proof: only the exact empty-envelopes place was replaced, rest byte-identical
    const producedEnvelopes = `<Envelopes>${buildEnvelopeXml(23005, breakpoints)}</Envelopes>`;
    const expected = FIX.replace("<Envelopes />", producedEnvelopes);

    expect(out).toBe(expected);
  });

  it("behaelt aeussere Envelopes-Huelle (Ableton-Nesting Regression)", () => {
    const breakpoints = [{ time: 0, value: 100 }];
    const out = injectClipEnvelope(FIX, "Spike Test", 23005, breakpoints);
    // Isolate clip block
    const clipLoc = locateClipBlock(out, "Spike Test");
    const clipBlock = clipLoc.block;

    // Exactly 2 opening <Envelopes> tags in the clip
    const openCount = (clipBlock.match(/<Envelopes>/g) ?? []).length;

    expect(openCount).toBe(2);
    // Exactly one <ClipEnvelope (not AutomationEnvelope)
    expect(clipBlock.match(/<ClipEnvelope/g) ?? []).toHaveLength(1);
    expect(clipBlock).not.toContain("AutomationEnvelope");
    // No remaining self-closing <Envelopes />
    expect(clipBlock).not.toMatch(/<Envelopes\s*\/>/);
    // Double closing
    expect(clipBlock).toMatch(/<\/Envelopes>\s*<\/Envelopes>/);
  });

  it("modifiziert nur den Ziel-Clip, andere Clips byte-identisch", () => {
    const out = injectClipEnvelope(TWO, "Target", 42, [{ time: 0, value: 1 }]);

    // 'Other' clip unchanged (still has <Envelopes><Envelopes />)
    expect(out).toContain(
      '<MidiClip Id="0"><Name Value="Other" /><Envelopes><Envelopes /></Envelopes></MidiClip>',
    );
    // 'Target' clip now has double-nesting with ClipEnvelope
    expect(out).toMatch(
      /<MidiClip Id="1"><Name Value="Target" \/(?:><Envelopes){2}><ClipEnvelope/,
    );
    // exactly one remaining empty-envelopes place (in Other clip)
    expect(out.match(/<Envelopes \/>/g) ?? []).toHaveLength(1);
  });

  it("wirft bei unbekanntem Clip", () => {
    expect(() =>
      injectClipEnvelope(FIX, "Nope", 1, [{ time: 0, value: 1 }]),
    ).toThrow(/nicht gefunden/);
  });

  it("wirft wenn Clip keine leere Envelopes-Sektion hat", () => {
    const filled = FIX.replace(
      "<Envelopes><Envelopes /></Envelopes>",
      "<Envelopes><ClipEnvelope/></Envelopes>",
    );

    expect(() =>
      injectClipEnvelope(filled, "Spike Test", 1, [{ time: 0, value: 1 }]),
    ).toThrow(/bereits|keine/);
  });

  it("strukturelle Treue: Tag-Reihenfolge entspricht Ableton-Ground-Truth", () => {
    // Build a small inject and normalize all numeric attribute values to "N"
    const breakpoints = [
      { time: 1, value: 127 },
      { time: 2, value: 64 },
    ];
    const out = injectClipEnvelope(FIX, "Spike Test", 23005, breakpoints);
    const clipLoc = locateClipBlock(out, "Spike Test");
    const clipBlock = clipLoc.block;

    // Extract the Envelopes section
    const envStart = clipBlock.indexOf("<Envelopes>");
    const envEnd =
      clipBlock.lastIndexOf("</Envelopes>") + "</Envelopes>".length;
    const envSection = clipBlock.slice(envStart, envEnd);

    // Normalize all Id="N", Value="N", Time="N" (including negative) to "N"
    const normalized = envSection
      .replaceAll(/Id="-?[\d.]+"/g, 'Id="N"')
      .replaceAll(/Value="-?[\d.]+"/g, 'Value="N"')
      .replaceAll(/Time="-?[\d.]+"/g, 'Time="N"');

    // Expected skeleton derived from ground-truth tag structure (3 FloatEvents: anchor + 2 bps)
    const expected =
      `<Envelopes>` +
      `<Envelopes>` +
      `<ClipEnvelope Id="N">` +
      `<EnvelopeTarget>` +
      `<PointeeId Value="N" />` +
      `</EnvelopeTarget>` +
      `<Automation>` +
      `<Events>` +
      `<FloatEvent Id="N" Time="N" Value="N" />` +
      `<FloatEvent Id="N" Time="N" Value="N" />` +
      `<FloatEvent Id="N" Time="N" Value="N" />` +
      `</Events>` +
      `<AutomationTransformViewState>` +
      `<IsTransformPending Value="false" />` +
      `<TimeAndValueTransforms />` +
      `</AutomationTransformViewState>` +
      `</Automation>` +
      `<LoopSlot>` +
      `<Value />` +
      `</LoopSlot>` +
      `<ScrollerTimePreserver>` +
      `<LeftTime Value="N" />` +
      `<RightTime Value="N" />` +
      `</ScrollerTimePreserver>` +
      `</ClipEnvelope>` +
      `</Envelopes>` +
      `</Envelopes>`;

    expect(normalized).toBe(expected);
  });
});
