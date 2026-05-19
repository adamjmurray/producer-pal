// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import {
  getArrangementClips,
  shiftTrackArrangementClips,
} from "../als-shift-time.ts";

// Byte-Ground-Truth (verifiziert 2026-05-19, fixture-frei aus echten Sets):
//
// e2e-test-set Track "Lead": GENAU EIN Arrangement-Clip im
// MainSequencer->ClipTimeable->ArrangerAutomation->Events-Scope:
//   <MidiClip Id="0" Time="32"> mit CurrentStart=32 / CurrentEnd=64.
// Der weitere `<MidiClip Id="0" Time="0">` im selben Track-Block liegt VOR
// <ClipTimeable> (Session-/Content-Clip) und ist damit ausserhalb des
// Arrangement-Scopes -> wird NICHT gelesen/verschoben (Plan-Praemisse
// "2 Arr-Clips Time 0 und 32" durch Recon widerlegt; siehe Bericht).
//
// arrangement-clip-tests Track "1. MIDI - Looped": EIN Arr-Clip Time=0,
// CurrentStart=0 / CurrentEnd=4 -> spanEnd=4 (Spanning-Fixture).
//
// C1-Recon (build-verifiziert 2026-05-19): AudioTracks haben KEIN
// <ClipTimeable> (hasCT=false), aber sehr wohl einen MainSequencer-
// ArrangerAutomation-Arrangement-Clip. arrangement-clip-tests Track
// "1. Audio - Looped": EIN AudioClip Id=1 Time=0, CurrentStart=0 /
// CurrentEnd=8 -> spanEnd=8. e2e-test-set "Audio 1": AudioClip Id=0
// Time=64. FreezeSequencer liegt IMMER NACH </MainSequencer> (Audio
// freezeIdx > msEndIdx, MIDI ebenso) -> der MainSequencer-Subblock-Anker
// ist Freeze-sicher OHNE ClipTimeable-Abhaengigkeit.
const E2E_SET = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";
const ACT_SET =
  "e2e/live-sets/arrangement-clip-tests Project/arrangement-clip-tests.als";

function leadBlock(): string {
  return locateTrackBlock(readAls(E2E_SET), "Lead").block;
}

function audioBlock(): string {
  return locateTrackBlock(readAls(ACT_SET), "1. Audio - Looped").block;
}

describe("getArrangementClips (echter e2e-test-set, Track Lead)", () => {
  it("liest GENAU den Arr-Clip im MainSequencer/ClipTimeable/AA/Events-Scope", () => {
    const clips = getArrangementClips(leadBlock());

    expect(clips).toHaveLength(1);
    expect(clips[0]?.id).toBe("0");
    expect(clips[0]?.time).toBe("32");
    expect(clips[0]?.startBeat).toBe(32);
    // CurrentEnd 64 - CurrentStart 32 = 32 -> spanEnd 32 + 32 = 64
    expect(clips[0]?.spanEnd).toBe(64);
  });

  it("ignoriert den Session-/Content-Clip Time=0 (vor ClipTimeable)", () => {
    const clips = getArrangementClips(leadBlock());

    expect(clips.some((c) => c.time === "0")).toBe(false);
  });

  it("setzt spanEnd=+Infinity wenn CurrentStart/CurrentEnd fehlt (R6)", () => {
    const block =
      "<MainSequencer><ClipTimeable><ArrangerAutomation><Events>" +
      '<MidiClip Id="7" Time="5"><Name Value="x" /></MidiClip>' +
      "</Events></ArrangerAutomation></ClipTimeable></MainSequencer>";
    const clips = getArrangementClips(block);

    expect(clips).toHaveLength(1);
    expect(clips[0]?.spanEnd).toBe(Number.POSITIVE_INFINITY);
  });

  it("setzt spanEnd=+Infinity wenn CurrentStart/End keine Zahl ist (R6)", () => {
    const block =
      "<MainSequencer><ClipTimeable><ArrangerAutomation><Events>" +
      '<MidiClip Id="3" Time="0"><CurrentStart Value="x" />' +
      '<CurrentEnd Value="4" /></MidiClip>' +
      "</Events></ArrangerAutomation></ClipTimeable></MainSequencer>";
    const clips = getArrangementClips(block);

    expect(clips[0]?.spanEnd).toBe(Number.POSITIVE_INFINITY);
  });

  it("liefert [] wenn kein MainSequencer-Subblock da ist", () => {
    expect(
      getArrangementClips("<MidiTrack><Mixer /></MidiTrack>"),
    ).toStrictEqual([]);
  });

  it("liefert [] wenn </MainSequencer> vor <MainSequencer> steht", () => {
    // msEnd < msStart -> kein gueltiger Subblock.
    expect(
      getArrangementClips("</MainSequencer>x<MainSequencer>"),
    ).toStrictEqual([]);
  });

  it("liefert [] wenn der MainSequencer keine ArrangerAutomation hat", () => {
    expect(
      getArrangementClips("<MainSequencer><Sample /></MainSequencer>"),
    ).toStrictEqual([]);
  });

  it("liefert [] bei leerem Arrangement (<Events /> selbstschliessend)", () => {
    // Tiefen-Scan ueberspringt `<Events />` -> kein offener Scope -> null.
    expect(
      getArrangementClips(
        "<MainSequencer><ArrangerAutomation><Events />" +
          "</ArrangerAutomation></MainSequencer>",
      ),
    ).toStrictEqual([]);
  });

  it("liefert [] bei nie geschlossenem <Events> (defensiv, kein Tiefe-0)", () => {
    // Unbalanciertes <Events> ohne </Events> -> Scan laeuft aus -> null.
    expect(
      getArrangementClips(
        "<MainSequencer><ArrangerAutomation><Events>" +
          '<MidiClip Id="9" Time="0">' +
          "</ArrangerAutomation></MainSequencer>",
      ),
    ).toStrictEqual([]);
  });

  it("ignoriert FreezeSequencer-ArrangerAutomation (NACH </MainSequencer>)", () => {
    const block =
      "<MainSequencer><ClipTimeable><ArrangerAutomation><Events>" +
      '<MidiClip Id="1" Time="8"><CurrentStart Value="0" />' +
      '<CurrentEnd Value="4" /></MidiClip></Events></ArrangerAutomation>' +
      "</ClipTimeable></MainSequencer>" +
      "<FreezeSequencer><ArrangerAutomation><Events>" +
      '<AudioClip Id="99" Time="999"><CurrentStart Value="0" />' +
      '<CurrentEnd Value="4" /></AudioClip>' +
      "</Events></ArrangerAutomation></FreezeSequencer>";
    const clips = getArrangementClips(block);

    expect(clips.map((c) => c.id)).toStrictEqual(["1"]);
  });

  it("liest Arr-Clips OHNE <ClipTimeable> (AudioTrack-Struktur, C1)", () => {
    // AudioTracks haben kein ClipTimeable; Anker muss der MainSequencer-
    // Subblock sein, nicht ClipTimeable.
    const block =
      "<MainSequencer><Sample /><ArrangerAutomation><Events>" +
      '<AudioClip Id="5" Time="16"><CurrentStart Value="16" />' +
      '<CurrentEnd Value="24" /></AudioClip>' +
      "</Events></ArrangerAutomation></MainSequencer>";
    const clips = getArrangementClips(block);

    expect(clips).toHaveLength(1);
    expect(clips[0]?.id).toBe("5");
    expect(clips[0]?.time).toBe("16");
    expect(clips[0]?.spanEnd).toBe(24);
  });

  it("erfasst NUR den aeusseren Arr-Clip, NICHT nested <Events> (I1)", () => {
    // Adversarial: ein Arr-Clip mit nested <Envelopes>...<Events>
    // <MidiClip Id="777" Time="888"/></Events>. Der Tiefen-Scan muss das
    // korrespondierende AEUSSERE </Events> finden, nicht das erste.
    const block =
      "<MainSequencer><ArrangerAutomation><Events>" +
      '<MidiClip Id="3" Time="0"><CurrentStart Value="0" />' +
      '<CurrentEnd Value="4" />' +
      "<Envelopes><Automation><Events>" +
      '<MidiClip Id="777" Time="888" />' +
      "</Events></Automation></Envelopes>" +
      "</MidiClip>" +
      "</Events></ArrangerAutomation></MainSequencer>";
    const clips = getArrangementClips(block);

    expect(clips.map((c) => c.id)).toStrictEqual(["3"]);
    expect(clips.some((c) => c.id === "777" || c.time === "888")).toBe(false);

    // shift darf den nested 777:888 NICHT anfassen (Splice-Scope = Region).
    const { block: out, shifted } = shiftTrackArrangementClips(block, 0, 8);

    expect(shifted).toBe(1);
    expect(out).toContain('<MidiClip Id="777" Time="888" />');
    expect(out).toContain('<MidiClip Id="3" Time="8">');
  });

  it("liest >=2 Arr-Clips einer Spur in Dokumentreihenfolge (M2)", () => {
    const block =
      "<MainSequencer><ArrangerAutomation><Events>" +
      '<MidiClip Id="1" Time="0"><CurrentStart Value="0" />' +
      '<CurrentEnd Value="4" /></MidiClip>' +
      '<MidiClip Id="2" Time="32"><CurrentStart Value="32" />' +
      '<CurrentEnd Value="40" /></MidiClip>' +
      "</Events></ArrangerAutomation></MainSequencer>";
    const clips = getArrangementClips(block);

    expect(clips.map((c) => c.id)).toStrictEqual(["1", "2"]);
    expect(clips.map((c) => c.time)).toStrictEqual(["0", "32"]);
    expect(clips[1]?.spanEnd).toBe(40);
  });
});

describe("getArrangementClips (echter AudioTrack, C1)", () => {
  it("liefert den Arr-AudioClip OHNE ClipTimeable-Abhaengigkeit", () => {
    const clips = getArrangementClips(audioBlock());

    expect(clips).toHaveLength(1);
    expect(clips[0]?.id).toBe("1");
    expect(clips[0]?.time).toBe("0");
    // CurrentEnd 8 - CurrentStart 0 = 8 -> spanEnd 0 + 8 = 8
    expect(clips[0]?.spanEnd).toBe(8);
  });
});

describe("shiftTrackArrangementClips (echter Set)", () => {
  it("verschiebt nur Clips startBeat>=fromBeat (positiver Delta)", () => {
    const block = leadBlock();
    const { block: out, shifted } = shiftTrackArrangementClips(block, 16, 8);

    expect(shifted).toBe(1);
    const clips = getArrangementClips(out);

    expect(clips[0]?.time).toBe("40");
    expect(clips[0]?.startBeat).toBe(40);
  });

  it("laesst Clips mit startBeat<fromBeat unveraendert (shifted=0)", () => {
    const block = leadBlock();
    // Lead-Clip ist bei 32, spanEnd 64; fromBeat 65 liegt hinter dem Clip
    // -> kein Clip startBeat>=65, keiner spannt 65
    const { block: out, shifted } = shiftTrackArrangementClips(block, 65, 8);

    expect(shifted).toBe(0);
    expect(out).toBe(block);
  });

  it("akzeptiert negativen Delta solange Ergebnis >= 0", () => {
    const block = leadBlock();
    const { block: out, shifted } = shiftTrackArrangementClips(block, 0, -8);

    expect(shifted).toBe(1);
    expect(getArrangementClips(out)[0]?.time).toBe("24");
  });

  it("formatiert ganzzahliges Ergebnis ohne Dezimalpunkt", () => {
    const block = leadBlock();
    const { block: out } = shiftTrackArrangementClips(block, 0, 8);

    expect(out).toContain('<MidiClip Id="0" Time="40">');
    expect(out).not.toContain('Time="40.0"');
  });

  it("formatiert nicht-ganzzahliges Ergebnis als JS-String", () => {
    const block = leadBlock();
    const { block: out } = shiftTrackArrangementClips(block, 0, 0.5);

    expect(getArrangementClips(out)[0]?.time).toBe("32.5");
  });

  it("aendert NUR das Time-Attribut, restliche Clip-Bytes 1:1", () => {
    const block = leadBlock();
    const { block: out } = shiftTrackArrangementClips(block, 0, 8);

    // nur eine Stelle differiert: Time="32" -> Time="40"
    expect(block.replace('Time="32"', 'Time="40"')).toBe(out);
  });

  it("verschiebt einen echten AudioTrack-Arr-Clip (C1, kein ClipTimeable)", () => {
    const block = audioBlock();
    const { block: out, shifted } = shiftTrackArrangementClips(block, 0, 8);

    expect(shifted).toBe(1);
    const clips = getArrangementClips(out);

    expect(clips).toHaveLength(1);
    expect(clips[0]?.time).toBe("8");
    // nur das Time-Attribut des AudioClips differiert (erstes Time="0")
    expect(block.replace('Time="0"', 'Time="8"')).toBe(out);
  });

  it("verschiebt >=2 Arr-Clips reverse-splice-offsetstabil (M2)", () => {
    const block =
      "<MainSequencer><ArrangerAutomation><Events>" +
      '<MidiClip Id="1" Time="0"><CurrentStart Value="0" />' +
      '<CurrentEnd Value="4" /></MidiClip>' +
      '<MidiClip Id="2" Time="32"><CurrentStart Value="32" />' +
      '<CurrentEnd Value="36" /></MidiClip>' +
      "</Events></ArrangerAutomation></MainSequencer>";
    const { block: out, shifted } = shiftTrackArrangementClips(block, 0, 8);

    expect(shifted).toBe(2);
    const clips = getArrangementClips(out);

    expect(clips.map((c) => c.time)).toStrictEqual(["8", "40"]);
    // beide Time-Attribute exakt ersetzt, sonst byte-identisch
    expect(
      block.replace('Time="0"', 'Time="8"').replace('Time="32"', 'Time="40"'),
    ).toBe(out);
  });
});

describe("shiftTrackArrangementClips Guards (Throw, kein Partial)", () => {
  it("wirft bei NaN fromBeat", () => {
    expect(() =>
      shiftTrackArrangementClips(leadBlock(), Number.NaN, 4),
    ).toThrow();
  });

  it("wirft bei NaN delta", () => {
    expect(() =>
      shiftTrackArrangementClips(leadBlock(), 0, Number.NaN),
    ).toThrow();
  });

  it("wirft wenn ein Clip die Schnittstelle spannt (start<P<spanEnd)", () => {
    // Clip Time=0, spanEnd=4; fromBeat=2 liegt in [0,4) -> spanning
    const block = locateTrackBlock(readAls(ACT_SET), "1. MIDI - Looped").block;

    expect(() => shiftTrackArrangementClips(block, 2, 4)).toThrow(/spann/i);
  });

  it("wirft wenn ein verschobener Clip unter 0 gezogen wuerde", () => {
    // Lead-Clip bei 32; fromBeat 0, delta -40 -> 32-40 = -8 < 0
    expect(() => shiftTrackArrangementClips(leadBlock(), 0, -40)).toThrow(
      /negativ|< ?0|kleiner/i,
    );
  });

  it("liefert shifted=0 + unveraenderten Block ohne Arrangement-Scope", () => {
    const block = "<MidiTrack><Mixer /></MidiTrack>";
    const res = shiftTrackArrangementClips(block, 0, 8);

    expect(res.shifted).toBe(0);
    expect(res.block).toBe(block);
  });

  it("verschiebt einen Clip exakt AUF die Schnittstelle (kein Spanning)", () => {
    // arrangement-clip-tests Clip Time=0 spanEnd=4; fromBeat=0 -> start>=P,
    // spannt NICHT (start nicht < P) -> erlaubt
    const block = locateTrackBlock(readAls(ACT_SET), "1. MIDI - Looped").block;
    const { shifted } = shiftTrackArrangementClips(block, 0, 8);

    expect(shifted).toBe(1);
  });
});
