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
});
