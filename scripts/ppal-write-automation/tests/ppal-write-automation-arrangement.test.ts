// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import * as zlib from "node:zlib";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runCli } from "../ppal-write-automation.ts";
import { readAls } from "#src/automation/als-file.ts";
import { parseBreakpoints } from "#src/automation/breakpoint-parser.ts";
import * as arrangementWriter from "#src/automation/als-arrangement-writer.ts";

// Multi-Track-Inline-.als: zwei MidiTracks (A, B), jeder mit Mixer/Volume
// (AutomationTarget) und einem leeren <AutomationEnvelopes><Envelopes />
// </AutomationEnvelopes>-Platzhalter. Dient den Mitigation-B-Track-genau-Tests.
const MULTI_TRACK_XML = [
  `<Ableton>`,
  `<Tracks>`,
  `<MidiTrack Id="1">`,
  `<Name><EffectiveName Value="TrackA" /><UserName Value="TrackA" /></Name>`,
  `<DeviceChain>`,
  `<Mixer>`,
  `<Volume><AutomationTarget Id="40001"><LockEnvelope Value="0" /></AutomationTarget>`,
  `<Manual Value="0.85" /></Volume>`,
  `</Mixer>`,
  `<AutomationEnvelopes><Envelopes /></AutomationEnvelopes>`,
  `</DeviceChain>`,
  `</MidiTrack>`,
  `<MidiTrack Id="2">`,
  `<Name><EffectiveName Value="TrackB" /><UserName Value="TrackB" /></Name>`,
  `<DeviceChain>`,
  `<Mixer>`,
  `<Volume><AutomationTarget Id="40002"><LockEnvelope Value="0" /></AutomationTarget>`,
  `<Manual Value="0.70" /></Volume>`,
  `</Mixer>`,
  `<AutomationEnvelopes><Envelopes /></AutomationEnvelopes>`,
  `</DeviceChain>`,
  `</MidiTrack>`,
  `</Tracks>`,
  `</Ableton>`,
].join("");

/**
 * Erzeugt eine gzip-komprimierte Temp-.als aus beliebigem XML.
 * @param xml - Roh-XML-Inhalt
 * @returns Pfad zur erzeugten Temp-Datei
 */
function createTmpAlsFrom(xml: string): string {
  const tmpPath = path.join(
    os.tmpdir(),
    `ppal-mt-test-${Date.now()}-${Math.random().toString(36).slice(2)}.als`,
  );

  fs.writeFileSync(tmpPath, zlib.gzipSync(Buffer.from(xml, "utf8")));

  return tmpPath;
}

describe("scope=arrangement Guards & Mitigation-B (Slice 2 T5)", () => {
  it("FIX 5: arrangement ohne --breakpoints -> Exit 1 + Meldung", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const tmpPath = createTmpAlsFrom(MULTI_TRACK_XML);

    try {
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmpPath,
        "--track",
        "TrackA",
        "--target",
        "mixer:volume",
        "--force",
      ]);

      expect(code).toBe(1);
      expect(spy.mock.calls.map((c) => String(c[0])).join("")).toContain(
        "--als, --track und --breakpoints erforderlich",
      );
    } finally {
      spy.mockRestore();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("FIX 1: Inject in TrackA -> Outer-Vergleich GRÜN, nur TrackA geändert", () => {
    const tmpPath = createTmpAlsFrom(MULTI_TRACK_XML);

    try {
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmpPath,
        "--track",
        "TrackA",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5,4=1.0",
        "--force",
      ]);

      expect(code).toBe(0);

      const written = readAls(tmpPath);

      // PointeeId von TrackA-Volume, FloatEvents = 2 BP + 1 Anchor = 3
      expect(written).toContain('<PointeeId Value="40001" />');
      expect([...written.matchAll(/<FloatEvent /g)]).toHaveLength(3);
      // TrackB-Platzhalter unangetastet
      expect(written).toContain(
        `<Name><EffectiveName Value="TrackB" /><UserName Value="TrackB" /></Name><DeviceChain><Mixer><Volume><AutomationTarget Id="40002"><LockEnvelope Value="0" /></AutomationTarget><Manual Value="0.70" /></Volume></Mixer><AutomationEnvelopes><Envelopes /></AutomationEnvelopes>`,
      );
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  // Fremdänderung INNERHALB des TrackB-AutomationEnvelopes-Blocks (genau das,
  // was der alte globale STRIP /<AutomationEnvelopes>[^]*?</...>/g
  // wegnormalisiert hätte). Beweist beides: (1) alter STRIP MASKIERT die
  // Korruption (STRIP-normalisiert identisch), (2) neuer Ziel-Track-genauer
  // Outer-Vergleich FÄNGT sie (Exit 1).
  const EMPTY_PH = "<AutomationEnvelopes><Envelopes /></AutomationEnvelopes>";
  const FAKE_PH =
    "<AutomationEnvelopes><Envelopes><FAKE /></Envelopes></AutomationEnvelopes>";

  /**
   * Ersetzt den LETZTEN leeren AutomationEnvelopes-Platzhalter (= TrackB,
   * nachdem TrackA gefüllt wurde) durch einen mit Fremd-Inhalt.
   * @param s - XML-String mit gefülltem TrackA und leerem TrackB
   * @returns XML mit korruptem TrackB-Envelopes-Block
   */
  function corruptTrackB(s: string): string {
    const idx = s.lastIndexOf(EMPTY_PH);

    return s.slice(0, idx) + FAKE_PH + s.slice(idx + EMPTY_PH.length);
  }

  it("FIX 1 BEWEIS: TrackB-Korruption — alter globaler STRIP maskiert, neuer Ziel-Track-Vergleich fängt (Exit 1)", () => {
    const tmpPath = createTmpAlsFrom(MULTI_TRACK_XML);
    const realInject = arrangementWriter.injectArrangementEnvelope;
    const injSpy = vi
      .spyOn(arrangementWriter, "injectArrangementEnvelope")
      .mockImplementation((xml, trackName, id, bps) =>
        corruptTrackB(realInject(xml, trackName, id, bps)),
      );
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmpPath,
        "--track",
        "TrackA",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5,4=1.0",
        "--force",
      ]);

      // (2) Neuer Ziel-Track-genauer Outer-Vergleich fängt die Fremdänderung.
      expect(code).toBe(1);
      expect(spy.mock.calls.map((c) => String(c[0])).join("")).toContain(
        "unerwartete Änderung außerhalb des Ziel-Track-Blocks",
      );

      // (1) Maskierungs-Beweis: legit-only (nur TrackA) vs. korrumpiertes
      // updated — durch den alten globalen STRIP normalisiert IDENTISCH, der
      // alte Guard hätte also Exit 0 geliefert (Korruption unentdeckt).
      const OLD_STRIP = /<AutomationEnvelopes>[^]*?<\/AutomationEnvelopes>/g;
      const legitOnly = realInject(
        MULTI_TRACK_XML,
        "TrackA",
        "40001",
        parseBreakpoints("0=0.5\n4=1.0"),
      );

      expect(legitOnly.replaceAll(OLD_STRIP, "")).toBe(
        corruptTrackB(legitOnly).replaceAll(OLD_STRIP, ""),
      );
    } finally {
      spy.mockRestore();
      injSpy.mockRestore();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("FIX 4: verify prüft PointeeId UND FloatEvent-Count -> verified:false bei Mismatch", () => {
    const tmpPath = createTmpAlsFrom(MULTI_TRACK_XML);
    // injectArrangementEnvelope liefert das XML unverändert -> kein
    // AutomationEnvelope, keine PointeeId im readBack -> verified muss false
    // sein und Exit 1 (Clip-Pfad-Niveau-Verify).
    const injSpy = vi
      .spyOn(arrangementWriter, "injectArrangementEnvelope")
      .mockImplementation((xml: string) => xml);
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmpPath,
        "--track",
        "TrackA",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5,4=1.0",
        "--force",
      ]);

      expect(code).toBe(1);
      expect(spy.mock.calls.map((c) => String(c[0])).join("")).toContain(
        "Verifizierung fehlgeschlagen",
      );
    } finally {
      spy.mockRestore();
      injSpy.mockRestore();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("FIX 3: range==null Pfad validiert trotzdem (unbeschränkter Fallback) -> Exit 0", () => {
    const tmpPath = createTmpAlsFrom(MULTI_TRACK_XML);

    try {
      // mixer:volume liefert in diesem Fixture keine Min/Max -> range-Fallback
      // {min:-Infinity,max:Infinity}; validateBreakpoints läuft (kein Bypass).
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmpPath,
        "--track",
        "TrackA",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5,4=1.0",
        "--force",
      ]);

      expect(code).toBe(0);
      expect(readAls(tmpPath)).toContain('<PointeeId Value="40001" />');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });
});

// Slice-2b T5: CLI e2e mit `~`-Curve-Flag (newline-separiert), Re-Parse +
// Mitigation-B-Fremd-Track-Beweis. Wegwerf-.als aus Inline-XML.
describe("scope=arrangement Slice-2b ~curve e2e + Mitigation-B (T5)", () => {
  const CURVE_TUPLE =
    'CurveControl1X="0" CurveControl1Y="1" CurveControl2X="0" CurveControl2Y="1"';

  it("`~` an einem Breakpoint -> Start-Event traegt Tupel, lineare nicht; Fremd-Track byte-identisch", () => {
    const tmpPath = createTmpAlsFrom(MULTI_TRACK_XML);

    try {
      // newline-separiert (Parser-Format), `~` an Breakpoint 0. KEIN Komma
      // (CLI macht replaceAll(",", "\n"); `~` ueberlebt unveraendert).
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmpPath,
        "--track",
        "TrackA",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5~\n4=1.0\n8=0.25",
        "--force",
      ]);

      expect(code).toBe(0);

      const written = readAls(tmpPath);

      // Re-Parse: Start-Event des gebogenen Segments (Id=1) traegt das Tupel.
      expect(written).toContain(
        `<FloatEvent Id="1" Time="0" Value="0.5" ${CURVE_TUPLE} />`,
      );
      // Lineare Folge-Events ohne CurveControl.
      expect(written).toContain('<FloatEvent Id="2" Time="4" Value="1" />');
      expect(written).toContain('<FloatEvent Id="3" Time="8" Value="0.25" />');
      // Anchor (Id=0) bleibt linear.
      expect(written).toContain(
        '<FloatEvent Id="0" Time="-63072000" Value="0.5" />',
      );
      // Genau ein CurveControl-Tupel im ganzen Set.
      expect(written.match(/CurveControl1X/g) ?? []).toHaveLength(1);

      // Mitigation-B: TrackB (Fremd-Track) byte-identisch zum Platzhalter.
      expect(written).toContain(
        `<Name><EffectiveName Value="TrackB" /><UserName Value="TrackB" /></Name><DeviceChain><Mixer><Volume><AutomationTarget Id="40002"><LockEnvelope Value="0" /></AutomationTarget><Manual Value="0.70" /></Volume></Mixer><AutomationEnvelopes><Envelopes /></AutomationEnvelopes>`,
      );
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("Mitigation-B-Komplement: alles ausser Ziel-Track byte-identisch (mit Kurve)", () => {
    const tmpPath = createTmpAlsFrom(MULTI_TRACK_XML);

    try {
      const before = readAls(tmpPath);
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmpPath,
        "--track",
        "TrackA",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5~\n8=1.0",
        "--force",
      ]);

      expect(code).toBe(0);
      const after = readAls(tmpPath);
      // Ziel-Track-Block (TrackA) ausstanzen — Rest muss byte-identisch sein.
      const cut = (s: string): string => {
        const a = s.indexOf('<MidiTrack Id="1">');
        const b = s.indexOf("</MidiTrack>") + "</MidiTrack>".length;

        return s.slice(0, a) + s.slice(b);
      };

      expect(cut(before)).toBe(cut(after));
      // Und die Kurve ist wirklich drin (Kontrolle: nicht versehentlich linear).
      expect(after).toContain(CURVE_TUPLE);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("`~` am letzten Breakpoint -> Validatorfehler, Exit 1, keine Datei-Aenderung", () => {
    const tmpPath = createTmpAlsFrom(MULTI_TRACK_XML);
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      const before = readAls(tmpPath);
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmpPath,
        "--track",
        "TrackA",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5\n8=1.0~",
        "--force",
      ]);

      expect(code).toBe(1);
      expect(spy.mock.calls.map((c) => String(c[0])).join("")).toContain(
        "Folgesegment",
      );
      // Validator wirft VOR injectArrangementEnvelope -> Datei unveraendert.
      expect(readAls(tmpPath)).toBe(before);
    } finally {
      spy.mockRestore();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("ohne `~` byte-identisch zum Slice-2-Linear-Pfad (Regression)", () => {
    const linPath = createTmpAlsFrom(MULTI_TRACK_XML);
    const refPath = createTmpAlsFrom(MULTI_TRACK_XML);

    try {
      const args = (p: string): string[] => [
        "write",
        "--scope",
        "arrangement",
        "--als",
        p,
        "--track",
        "TrackA",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5\n4=1.0\n8=0.25",
        "--force",
      ];

      expect(runCli(args(linPath))).toBe(0);
      expect(runCli(args(refPath))).toBe(0);
      // Slice-2-Linear-Pfad: kein CurveControl, identischer Output.
      const out = readAls(linPath);

      expect(out).not.toContain("CurveControl");
      expect(out).toBe(readAls(refPath));
    } finally {
      for (const p of [linPath, refPath]) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
        if (fs.existsSync(`${p}.bak`)) fs.unlinkSync(`${p}.bak`);
      }
    }
  });
});

describe("e2e scope=arrangement", () => {
  const SRC =
    "/Users/macuser/Desktop/AIbleton/_throwaway-automation-test Project/_throwaway-automation-test.als";

  it("schreibt Mixer-Volume-Arrangement-Automation in Wegwerf-.als + verifiziert", () => {
    const tmp = SRC.replace(/\.als$/, ".s2e2e.als");

    fs.copyFileSync(SRC, tmp);

    try {
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmp,
        "--track",
        "Spike Instr",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5,4=1.0,8=0.25",
        "--force",
      ]);

      expect(code).toBe(0);
      const out = readAls(tmp);

      // Writer bewahrt Original-Einrueckung (Mitigation A) -> ws-tolerant
      expect(out).toMatch(/<AutomationEnvelopes>\s*<Envelopes>/);
      expect(out).toContain("<AutomationEnvelope ");
    } finally {
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });

  it("ändert NUR den AutomationEnvelopes-Block (Mitigation B)", () => {
    const tmp = SRC.replace(/\.als$/, ".s2assert.als");

    fs.copyFileSync(SRC, tmp);

    try {
      const before = readAls(tmp);
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmp,
        "--track",
        "Spike Instr",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5,8=1.0",
        "--force",
      ]);

      expect(code).toBe(0);
      const after = readAls(tmp);
      const STRIP = /<AutomationEnvelopes>[^]*?<\/AutomationEnvelopes>/g;

      expect(before.replaceAll(STRIP, "")).toBe(after.replaceAll(STRIP, ""));
    } finally {
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });
});
