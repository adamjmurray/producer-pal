// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import * as mfw from "#src/automation/midi-file-writer.ts";
import {
  midiExportInternals,
  runMidiExport,
} from "../ppal-midi-export-helpers.ts";
import { parseFlags } from "../clip-patch-cli.ts";

const SRC = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";

/**
 * Frisches Temp-Verzeichnis mit isolierter `.als`-Kopie + `out`-Pfad.
 * @returns `{ als, out }` Pfade.
 */
function tmpPaths(): { als: string; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "ppal-midi-"));

  copyFileSync(SRC, join(dir, "set.als"));

  return { als: join(dir, "set.als"), out: join(dir, "out.mid") };
}

/**
 * Eine minimale synthetische `.als` mit einem MidiTrack + notenlosem
 * MidiClip schreiben (re-parsebar fuer den leeren-Clip-Pfad).
 * @returns `{ als, out }` Pfade.
 */
function tmpEmptyClipAls(): { als: string; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "ppal-midi-empty-"));
  const als = join(dir, "set.als");
  const xml =
    '<?xml version="1.0"?><Ableton><LiveSet>' +
    '<Tempo><Manual Value="120" /></Tempo>' +
    '<Tracks><MidiTrack Id="0"><Name>' +
    '<EffectiveName Value="T" /><UserName Value="" /></Name>' +
    "<DeviceChain><MainSequencer><ClipSlotList><ClipSlot><ClipSlot>" +
    '<Value><MidiClip Id="0" Time="0"><Name Value="Empty" />' +
    '<TimeSignature><RemoteableTimeSignature Id="0">' +
    '<Numerator Value="4" /><Denominator Value="4" />' +
    "</RemoteableTimeSignature></TimeSignature>" +
    "<Notes><KeyTracks></KeyTracks></Notes>" +
    "</MidiClip></Value></ClipSlot></ClipSlot></ClipSlotList>" +
    "</MainSequencer></DeviceChain></MidiTrack></Tracks>" +
    "</LiveSet></Ableton>";

  writeFileSync(als, gzipSync(Buffer.from(xml, "utf8")));

  return { als, out: join(dir, "out.mid") };
}

/**
 * Note-On-Events (Status 0x90, velocity>0) in einem geschriebenen SMF zaehlen.
 * @param path - Pfad zur `.mid`-Datei.
 * @returns Anzahl der Note-On-Events.
 */
function countNoteOns(path: string): number {
  const b = readFileSync(path);
  let n = 0;

  for (let i = 14; i < b.length - 2; i++) {
    if ((b[i]! & 0xf0) === 0x90 && b[i + 2]! > 0) n++;
  }

  return n;
}

describe("runMidiExport Fehlerpfade", () => {
  it("fehlende Flags -> exit 1", () => {
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    expect(runMidiExport(["--als", "x"], parseFlags)).toBe(1);
    err.mockRestore();
  });

  it("AudioClip ('Audio 1'/'sample') -> exit 1", () => {
    const { als, out } = tmpPaths();
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runMidiExport(
      ["--als", als, "--track", "Audio 1", "--clip", "sample", "--out", out],
      parseFlags,
    );

    err.mockRestore();
    expect(code).toBe(1);
  });

  it("wert-gebundenes Verify faengt verfaelschten Encode (Spy) -> exit 1", () => {
    const { als, out } = tmpPaths();
    const real = mfw.encodeSmf;
    const spy = vi
      .spyOn(midiExportInternals, "encodeSmf")
      .mockImplementation((input) =>
        // Eine Note kuenstlich entfernen -> Note-On-Count != Soll.
        real({ ...input, notes: input.notes.slice(1) }),
      );
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runMidiExport(
      ["--als", als, "--track", "Drums", "--clip", "Beat", "--out", out],
      parseFlags,
    );

    err.mockRestore();
    spy.mockRestore();
    expect(code).toBe(1);
  });

  it("Verify faengt verfaelschten MThd-Header (falsche PPQ) -> exit 1", () => {
    const { als, out } = tmpPaths();
    // Valides MThd ausser PPQ (96 statt 480) + valider MTrk + Body ->
    // Laenge >= 22, aber headOk == false (PPQ-Vergleich schlaegt fehl).
    const corrupt = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01,
      0x00, 0x60, 0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x04, 0x00, 0xff,
      0x2f, 0x00,
    ]);
    const spy = vi
      .spyOn(midiExportInternals, "encodeSmf")
      .mockImplementation(() => corrupt);
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runMidiExport(
      ["--als", als, "--track", "Drums", "--clip", "Beat", "--out", out],
      parseFlags,
    );

    err.mockRestore();
    spy.mockRestore();
    expect(code).toBe(1);
  });

  it("Verify faengt zu kurze Datei (< 22 Bytes) -> exit 1", () => {
    const { als, out } = tmpPaths();
    // Nur 10 Bytes -> trifft den Short-File-Guard (b.length < 22).
    const corrupt = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00,
    ]);
    const spy = vi
      .spyOn(midiExportInternals, "encodeSmf")
      .mockImplementation(() => corrupt);
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runMidiExport(
      ["--als", als, "--track", "Drums", "--clip", "Beat", "--out", out],
      parseFlags,
    );

    err.mockRestore();
    spy.mockRestore();
    expect(code).toBe(1);
  });

  it("Verify faengt inkonsistente Track-Laenge (b.length != 22+trkLen) -> exit 1", () => {
    const { als, out } = tmpPaths();
    // Valides MThd + MTrk, trkLen-Feld = 99, aber nur 4 Body-Bytes ->
    // b.length (26) != 22 + 99. Header ist valide (headOk true).
    const corrupt = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01,
      0x01, 0xe0, 0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x63, 0x00, 0xff,
      0x2f, 0x00,
    ]);
    const spy = vi
      .spyOn(midiExportInternals, "encodeSmf")
      .mockImplementation(() => corrupt);
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runMidiExport(
      ["--als", als, "--track", "Drums", "--clip", "Beat", "--out", out],
      parseFlags,
    );

    err.mockRestore();
    spy.mockRestore();
    expect(code).toBe(1);
  });
});

describe("runMidiExport Erfolg ('Drums'/'Beat')", () => {
  it("exportiert 4 Noten, verifiziert, JSON-Payload (exit 0)", () => {
    const { als, out } = tmpPaths();
    let payload = "";
    const w = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((c: string | Uint8Array) => {
        payload += String(c);

        return true;
      });
    const code = runMidiExport(
      ["--als", als, "--track", "Drums", "--clip", "Beat", "--out", out],
      parseFlags,
    );

    w.mockRestore();
    expect(code).toBe(0);

    const json = JSON.parse(payload) as {
      track: string;
      clip: string;
      out: string;
      notes: number;
      verified: boolean;
    };

    expect(json.track).toBe("Drums");
    expect(json.clip).toBe("Beat");
    expect(json.notes).toBe(4);
    expect(json.verified).toBe(true);
    expect(countNoteOns(out)).toBe(4);
  });

  it("Determinismus: zweimaliger Export ist byte-gleich", () => {
    const { als, out } = tmpPaths();
    const w = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    runMidiExport(
      ["--als", als, "--track", "Drums", "--clip", "Beat", "--out", out],
      parseFlags,
    );

    const first = readFileSync(out);

    runMidiExport(
      ["--als", als, "--track", "Drums", "--clip", "Beat", "--out", out],
      parseFlags,
    );

    const second = readFileSync(out);

    w.mockRestore();
    expect(first.equals(second)).toBe(true);
  });
});

describe("runMidiExport notenloser Clip", () => {
  it("erzeugt valides re-parsebares minimal-SMF (exit 0, notes 0)", () => {
    const { als, out } = tmpEmptyClipAls();
    let payload = "";
    const w = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((c: string | Uint8Array) => {
        payload += String(c);

        return true;
      });
    const code = runMidiExport(
      ["--als", als, "--track", "T", "--clip", "Empty", "--out", out],
      parseFlags,
    );

    w.mockRestore();
    expect(code).toBe(0);

    const json = JSON.parse(payload) as { notes: number; verified: boolean };

    expect(json.notes).toBe(0);
    expect(json.verified).toBe(true);

    const b = readFileSync(out);

    expect(b.subarray(0, 4).toString("latin1")).toBe("MThd");
    expect(b.subarray(14, 18).toString("latin1")).toBe("MTrk");
  });
});
