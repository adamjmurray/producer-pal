// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { buildEnvelopeXml, injectClipEnvelope } from "./als-envelope-writer.ts";

const FIX = `<Ableton><Tracks><MidiTrack Id="18"><Name><UserName Value="Spike Instr" /></Name><DeviceChain><Devices><Operator Id="0"><Frequency><Manual Value="12000" /><AutomationTarget Id="23005"><LockEnvelope Value="0" /></AutomationTarget></Frequency></Operator></Devices></DeviceChain><ClipSlotList><ClipSlot><ClipSlot Id="0"><Value><MidiClip Id="0" Time="0"><CurrentStart Value="0" /><Name Value="Spike Test" /><Envelopes><Envelopes /></Envelopes><Disabled Value="false" /></MidiClip></Value></ClipSlot></ClipSlot></ClipSlotList></MidiTrack></Tracks></Ableton>`;

describe("buildEnvelopeXml", () => {
  it("baut AutomationEnvelope mit PointeeId und FloatEvents", () => {
    const s = buildEnvelopeXml(23005, [ { time: 0, value: 200 }, { time: 2, value: 8000 } ]);

    expect(s).toContain('<PointeeId Value="23005" />');
    expect(s).toContain('<FloatEvent Id="0" Time="0" Value="200" />');
    expect(s).toContain('<FloatEvent Id="1" Time="2" Value="8000" />');
    expect(s.startsWith("<AutomationEnvelope")).toBe(true);
    expect(s).toContain("<IsTransformPending Value=\"false\" />");
  });
});

describe("injectClipEnvelope", () => {
  it("ersetzt leeres Envelopes im Ziel-Clip", () => {
    const out = injectClipEnvelope(FIX, "Spike Test", 23005, [ { time: 0, value: 200 }, { time: 4, value: 400 } ]);

    expect(out).toContain('<PointeeId Value="23005" />');
    expect(out).toContain('<FloatEvent Id="1" Time="4" Value="400" />');
    expect(out).not.toContain("<Envelopes><Envelopes /></Envelopes>");
    // nur die Envelopes-Stelle geaendert: Rest unveraendert
    expect(out.replace(/<Envelopes>.*<\/Envelopes>/s, "X")).toBe(FIX.replace("<Envelopes><Envelopes /></Envelopes>", "X"));
  });
  it("wirft bei unbekanntem Clip", () => {
    expect(() => injectClipEnvelope(FIX, "Nope", 1, [{ time: 0, value: 1 }])).toThrow(/nicht gefunden/);
  });
  it("wirft wenn Clip keine leere Envelopes-Sektion hat", () => {
    const filled = FIX.replace("<Envelopes><Envelopes /></Envelopes>", "<Envelopes><AutomationEnvelope/></Envelopes>");

    expect(() => injectClipEnvelope(filled, "Spike Test", 1, [{ time: 0, value: 1 }])).toThrow(/bereits|keine/);
  });
});
