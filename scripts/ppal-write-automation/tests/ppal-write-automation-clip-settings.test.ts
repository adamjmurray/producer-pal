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
import {
  clipSettingsInternals,
  applyClipSettingPatches,
} from "../ppal-clip-settings-helpers.ts";

const THROWAWAY_ALS =
  "/Users/macuser/Desktop/AIbleton/_throwaway-automation-test Project/_throwaway-automation-test.als";

/**
 * Inline-.als mit zwei Clips in einem Track (gleich- oder verschiedennamig) —
 * für Dubletten- und Mitigation-B-Fremdclip-Beweis.
 * @param name1 - Name des ersten Clips
 * @param name2 - Name des zweiten Clips
 * @returns Roh-XML-String
 */
function dupClipXml(name1: string, name2: string): string {
  return [
    `<Ableton><Tracks><MidiTrack Id="1">`,
    `<Name><EffectiveName Value="T" /><UserName Value="T" /></Name>`,
    `<DeviceChain><MainSequencer><ClipSlotList><ClipSlot>`,
    `<MidiClip Time="0"><Name Value="${name1}" /><Color Value="1" />`,
    `<LaunchMode Value="0" /><LaunchQuantisation Value="0" />`,
    `<TimeSignature><Foo /></TimeSignature></MidiClip>`,
    `</ClipSlot><ClipSlot>`,
    `<MidiClip Time="0"><Name Value="${name2}" /><Color Value="2" />`,
    `<LaunchMode Value="0" /><LaunchQuantisation Value="0" />`,
    `<TimeSignature><Foo /></TimeSignature></MidiClip>`,
    `</ClipSlot></ClipSlotList></MainSequencer></DeviceChain>`,
    `</MidiTrack></Tracks></Ableton>`,
  ].join("");
}

/**
 * Schreibt eine gzip-komprimierte Temp-.als aus Roh-XML.
 * @param xml - Roh-XML-Inhalt
 * @returns Pfad zur Temp-Datei
 */
function tmpAls(xml: string): string {
  const p = path.join(
    os.tmpdir(),
    `ppal-cs-${Date.now()}-${Math.random().toString(36).slice(2)}.als`,
  );

  fs.writeFileSync(p, zlib.gzipSync(Buffer.from(xml, "utf8")));

  return p;
}

/**
 * Baut eine clip-settings-Argumentliste kompakt.
 * @param sub - get|set
 * @param als - .als-Pfad
 * @param track - Track-Name
 * @param clip - Clip-Name
 * @param extra - Zusätzliche Flags/Pairs in Reihenfolge
 * @returns Vollständige argv-Liste
 */
function csArgs(
  sub: string,
  als: string,
  track: string,
  clip: string,
  ...extra: string[]
): string[] {
  return [
    "clip-settings",
    sub,
    "--als",
    als,
    "--track",
    track,
    "--clip",
    clip,
    ...extra,
  ];
}

describe("clip-settings", () => {
  it("fehlende Pflichtflags -> Exit 1", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      expect(runCli(["clip-settings"])).toBe(1);
      expect(runCli(["clip-settings", "get", "--als", "x"])).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("e2e: get + set Multi-Patch gegen echte Wegwerf-.als", () => {
    const tmp = THROWAWAY_ALS.replace(/\.als$/, ".s3.als");

    fs.copyFileSync(THROWAWAY_ALS, tmp);

    try {
      const t = "Spike Instr";
      const c = "Spike Test";

      expect(runCli(csArgs("get", tmp, t, c))).toBe(0);

      const code = runCli(
        csArgs(
          "set",
          tmp,
          t,
          c,
          "--key",
          "LaunchMode",
          "--value",
          "1",
          "--key",
          "FollowActionEnabled",
          "--value",
          "true",
          "--key",
          "FollowChanceA",
          "--value",
          "75",
          "--force",
        ),
      );

      expect(code).toBe(0);

      const out = readAls(tmp);

      expect(out).toContain('<LaunchMode Value="1" />');
      expect(out).toContain('<FollowActionEnabled Value="true" />');
      expect(out).toContain('<FollowChanceA Value="75" />');

      // Mitigation-B byte-genau: alles AUSSERHALB des Ziel-Clip-Blocks ist
      // identisch zum Original (ersetzt den separaten only-target-Test —
      // strikteres Byte-Komplement-Kriterium auf der echten .als).
      const beforeXml = readAls(THROWAWAY_ALS);
      const ti = beforeXml.indexOf("Spike Instr");
      const ts = beforeXml.lastIndexOf("<MidiTrack ", ti);
      const te = beforeXml.indexOf("</MidiTrack>", ts) + "</MidiTrack>".length;

      expect(out.slice(0, ts)).toBe(beforeXml.slice(0, ts));
      expect(out.slice(out.length - (beforeXml.length - te))).toBe(
        beforeXml.slice(te),
      );
    } finally {
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });

  it("BEWEIS: Fremd-Clip-Korruption -> Mitigation-B-Guard Exit 1 (sonst maskiert)", () => {
    const xml = dupClipXml("ZielClip", "FremdClip");
    const tmp = tmpAls(xml);
    const applySpy = vi
      .spyOn(clipSettingsInternals, "applyClipSettingPatches")
      .mockImplementation((x, loc, pairs) =>
        // Reale Ziel-Patch + künstliche Änderung in einem ANDEREN Clip-Block:
        applyClipSettingPatches(x, loc, pairs).replace(
          '<Name Value="FremdClip" />',
          '<Name Value="FremdClipKORRUPT" />',
        ),
      );
    const errSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      const code = runCli(
        csArgs(
          "set",
          tmp,
          "T",
          "ZielClip",
          "--key",
          "LaunchMode",
          "--value",
          "2",
          "--force",
        ),
      );

      expect(code).toBe(1);
      expect(errSpy.mock.calls.map((c) => String(c[0])).join("")).toContain(
        "außerhalb des Ziel-Clip-Blocks",
      );
    } finally {
      applySpy.mockRestore();
      errSpy.mockRestore();
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });

  it("zwei gleichnamige Clips im Track -> Klartext-Fehler (keine stille Auswahl)", () => {
    const tmp = tmpAls(dupClipXml("DubClip", "DubClip"));
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      const code = runCli(csArgs("get", tmp, "T", "DubClip"));

      expect(code).toBe(1);
      expect(spy.mock.calls.map((c) => String(c[0])).join("")).toMatch(
        /mehrfach|mehrdeutig|zweimal|2/i,
      );
    } finally {
      spy.mockRestore();
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });

  // FIX A: Verify-Maskierung. patchClipSetting schreibt den Tag NICHT (Spy gibt
  // einen Block OHNE LaunchMode-Tag zurueck), Soll == SPEC-Default "0".
  // Alter Verify (after[key] === value) liest den Default zurueck -> faelsch
  // true. Der zusaetzliche Roh-Tag-Check muss false (Exit 1) erzwingen.
  it("BEWEIS: nicht geschriebener Tag bei Soll==Default -> Verify Exit 1 (sonst maskiert)", () => {
    // Block ohne <LaunchMode .../> -> getClipSettings liefert Default "0".
    const xml = [
      `<Ableton><Tracks><MidiTrack Id="1">`,
      `<Name><EffectiveName Value="T" /><UserName Value="T" /></Name>`,
      `<DeviceChain><MainSequencer><ClipSlotList><ClipSlot>`,
      `<MidiClip Time="0"><Name Value="ZielClip" /><Color Value="1" />`,
      `<LaunchQuantisation Value="0" />`,
      `<TimeSignature><Foo /></TimeSignature></MidiClip>`,
      `</ClipSlot></ClipSlotList></MainSequencer></DeviceChain>`,
      `</MidiTrack></Tracks></Ableton>`,
    ].join("");
    const tmp = tmpAls(xml);
    // Spy: Ziel-Patch NICHT anwenden (Original-XML unveraendert zurueck) ->
    // LaunchMode-Tag fehlt weiterhin, Mitigation-B-Guard bleibt gruen
    // (Prefix/Suffix identisch), nur der Verify muss greifen.
    const applySpy = vi
      .spyOn(clipSettingsInternals, "applyClipSettingPatches")
      .mockImplementation((x) => x);
    const errSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      const code = runCli(
        csArgs(
          "set",
          tmp,
          "T",
          "ZielClip",
          "--key",
          "LaunchMode",
          "--value",
          "0",
          "--force",
        ),
      );

      expect(code).toBe(1);
      expect(errSpy.mock.calls.map((c) => String(c[0])).join("")).toContain(
        "Verifizierung fehlgeschlagen",
      );
    } finally {
      applySpy.mockRestore();
      errSpy.mockRestore();
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });

  // FIX B: doppelter --key. Last-write-wins bleibt, aber stderr-Warnung muss
  // erscheinen, Exit 0, Endwert = letzter (2).
  it("doppelter --key -> stderr-Warnung, Exit 0, last-write-wins", () => {
    const tmp = tmpAls(dupClipXml("ZielClip", "FremdClip"));
    const errSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      const code = runCli(
        csArgs(
          "set",
          tmp,
          "T",
          "ZielClip",
          "--key",
          "LaunchMode",
          "--value",
          "1",
          "--key",
          "LaunchMode",
          "--value",
          "2",
          "--force",
        ),
      );

      expect(code).toBe(0);
      expect(errSpy.mock.calls.map((c) => String(c[0])).join("")).toMatch(
        /mehrfach angegeben|letzter wert gewinnt/i,
      );

      const out = readAls(tmp);

      expect(out).toContain('<LaunchMode Value="2" />');
      expect(out).not.toContain('<LaunchMode Value="1" />');
    } finally {
      errSpy.mockRestore();
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });

  // G3'-Enum-Warnung: Roh-Int bei enum-Key -> stderr-Warnung, kein Blockieren.
  it("enum-Key mit numerischem Wert -> stderr-Warnung, Exit 0, Patch erfolgt", () => {
    const tmp = tmpAls(dupClipXml("ZielClip", "FremdClip"));
    const errSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      const code = runCli(
        csArgs(
          "set",
          tmp,
          "T",
          "ZielClip",
          "--key",
          "LaunchMode",
          "--value",
          "2",
          "--force",
        ),
      );

      expect(code).toBe(0);
      const stderrOut = errSpy.mock.calls.map((c) => String(c[0])).join("");

      expect(stderrOut).toMatch(
        /enum.*validierung.*ausstehend|roh-integer.*ungeprüft/i,
      );
      expect(stderrOut).toMatch(/LaunchMode/);
      // Patch muss trotzdem erfolgt sein
      const out = readAls(tmp);

      expect(out).toContain('<LaunchMode Value="2" />');
    } finally {
      errSpy.mockRestore();
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });

  it("int-Key (VelocityAmount) mit numerischem Wert -> KEINE Enum-Warnung", () => {
    // Vollständiger Clip mit allen für VelocityAmount nötigen Positions-Ankern
    const fullClipXml = [
      `<Ableton><Tracks><MidiTrack Id="1">`,
      `<Name><EffectiveName Value="T" /><UserName Value="T" /></Name>`,
      `<DeviceChain><MainSequencer><ClipSlotList><ClipSlot>`,
      `<MidiClip Time="0"><Name Value="ZielClip" /><Color Value="1" />`,
      `<LaunchMode Value="0" /><LaunchQuantisation Value="0" />`,
      `<TimeSignature><Foo /></TimeSignature><TimeSelection><Bar /></TimeSelection>`,
      `<Legato Value="false" /><Ram Value="false" />`,
      `<VelocityAmount Value="0" />`,
      `<FollowAction>`,
      `<FollowTime Value="4" /><IsLinked Value="true" /><LoopIterations Value="1" />`,
      `<FollowActionA Value="4" /><FollowActionB Value="0" />`,
      `<FollowChanceA Value="100" /><FollowChanceB Value="0" />`,
      `<JumpIndexA Value="1" /><JumpIndexB Value="1" />`,
      `<FollowActionEnabled Value="false" />`,
      `</FollowAction></MidiClip>`,
      `</ClipSlot></ClipSlotList></MainSequencer></DeviceChain>`,
      `</MidiTrack></Tracks></Ableton>`,
    ].join("");
    const tmp = tmpAls(fullClipXml);
    const errSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      const code = runCli(
        csArgs(
          "set",
          tmp,
          "T",
          "ZielClip",
          "--key",
          "VelocityAmount",
          "--value",
          "5",
          "--force",
        ),
      );

      expect(code).toBe(0);
      const stderrOut = errSpy.mock.calls.map((c) => String(c[0])).join("");

      expect(stderrOut).not.toMatch(
        /enum.*validierung.*ausstehend|roh-integer.*ungeprüft/i,
      );
    } finally {
      errSpy.mockRestore();
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });

  // FIX C: zwei gleichnamige TRACKS -> keine stille Erstauswahl, Klartext.
  it("zwei gleichnamige Tracks -> Klartext-Fehler (keine stille Auswahl)", () => {
    const xml = [
      `<Ableton><Tracks>`,
      `<MidiTrack Id="1">`,
      `<Name><EffectiveName Value="DupTrack" /><UserName Value="DupTrack" /></Name>`,
      `<DeviceChain><MainSequencer><ClipSlotList><ClipSlot>`,
      `<MidiClip Time="0"><Name Value="C" /><Color Value="1" />`,
      `<LaunchMode Value="0" /><LaunchQuantisation Value="0" />`,
      `<TimeSignature><Foo /></TimeSignature></MidiClip>`,
      `</ClipSlot></ClipSlotList></MainSequencer></DeviceChain>`,
      `</MidiTrack>`,
      `<MidiTrack Id="2">`,
      `<Name><EffectiveName Value="DupTrack" /><UserName Value="DupTrack" /></Name>`,
      `<DeviceChain><MainSequencer><ClipSlotList><ClipSlot>`,
      `<MidiClip Time="0"><Name Value="C" /><Color Value="2" />`,
      `<LaunchMode Value="0" /><LaunchQuantisation Value="0" />`,
      `<TimeSignature><Foo /></TimeSignature></MidiClip>`,
      `</ClipSlot></ClipSlotList></MainSequencer></DeviceChain>`,
      `</MidiTrack>`,
      `</Tracks></Ableton>`,
    ].join("");
    const tmp = tmpAls(xml);
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      const code = runCli(csArgs("get", tmp, "DupTrack", "C"));

      expect(code).toBe(1);
      expect(spy.mock.calls.map((c) => String(c[0])).join("")).toMatch(
        /track "duptrack" mehrfach|mehrdeutig/i,
      );
    } finally {
      spy.mockRestore();
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });
});
