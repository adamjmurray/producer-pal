// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync, writeFileSync } from "node:fs";
import { readAls } from "#src/automation/als-file.ts";
import {
  extractMidiNotes,
  getGlobalTempoBpm,
} from "#src/automation/als-midi-notes.ts";
import { encodeSmf, type SmfNote } from "#src/automation/midi-file-writer.ts";
import { locateClipWithinTrack, type ClipLocation } from "./clip-patch-cli.ts";

/** Konstante Pulses-per-Quarter fuer den Beats->Tick-Bezug. */
const PPQ = 480;

/**
 * Mutable Spy-Seam: der Encoder wird hierueber aufgerufen, damit der
 * wert-gebundene Verify-Test seinen Output ueber `vi.spyOn` verfaelschen
 * kann (ohne verbotenen Self-Import) — analog `warpInternals`.
 */
export const midiExportInternals = { encodeSmf };

/**
 * Den `midi-export`-Subcommand ausfuehren: einen MidiClip als Standard-MIDI-
 * File (SMF Type 0) schreiben. Lean clip-scoped Pfad: locate -> MidiClip-
 * Guard -> extract Noten + globales Tempo -> Beats->Tick (`Math.round`,
 * PPQ 480) -> `encodeSmf` -> `writeFileSync`. Anschliessend WERT-GEBUNDENES
 * Verify (Premortem R3): die geschriebene Datei wird zurueckgelesen, der
 * MThd-Header geparst UND die Note-On-Anzahl im MTrk gegen die erwartete
 * Notenzahl geprueft (kein `existsSync`).
 *
 * @param rest - Argument-Array (ohne das `midi-export`-Token).
 * @param parseFlags - Geteilter Flag-Parser aus dem CLI-Modul.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler.
 */
export function runMidiExport(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  const flags = parseFlags(rest);
  const alsPath = flags.als;
  const track = flags.track;
  const clip = flags.clip;
  const out = flags.out;

  if (alsPath == null || track == null || clip == null || out == null) {
    process.stderr.write(
      "FEHLER: --als, --track, --clip, --out erforderlich\n",
    );

    return 1;
  }

  const xml = readAls(alsPath);
  const loc = locateClipWithinTrack(xml, track, clip);

  if (!loc.block.startsWith("<MidiClip")) {
    process.stderr.write(
      "FEHLER: MIDI-Export nur fuer MidiClip (Clip ist AudioClip)\n",
    );

    return 1;
  }

  return encodeAndVerify(loc, xml, { track, clip, out });
}

/** Ziel-Identifikatoren fuer Encode + Report. */
interface ExportTarget {
  track: string;
  clip: string;
  out: string;
}

/**
 * Noten extrahieren, kodieren, schreiben und wert-gebunden re-verifizieren.
 * @param loc - Lokalisierter Clip-Block.
 * @param xml - Voll-XML (fuer das globale Tempo).
 * @param t - Ziel-Identifikatoren.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler.
 */
function encodeAndVerify(
  loc: ClipLocation,
  xml: string,
  t: ExportTarget,
): number {
  const { notes, timeSig } = extractMidiNotes(loc.block);
  const tempoBpm = getGlobalTempoBpm(xml);
  const smfNotes: SmfNote[] = notes.map((n) => ({
    pitch: n.pitch,
    startTick: Math.round(n.startBeats * PPQ),
    durationTick: Math.round(n.durationBeats * PPQ),
    velocity: n.velocity,
    offVelocity: n.offVelocity,
  }));
  const bytes = midiExportInternals.encodeSmf({
    ppq: PPQ,
    tempoBpm,
    timeSig,
    notes: smfNotes,
  });

  writeFileSync(t.out, Buffer.from(bytes));

  if (!verifyWrittenSmf(t.out, notes.length)) {
    process.stderr.write(
      "FEHLER: Re-Decode-Verify fehlgeschlagen (.mid != Soll)\n",
    );

    return 1;
  }

  process.stdout.write(
    `${JSON.stringify({
      track: t.track,
      clip: t.clip,
      out: t.out,
      notes: notes.length,
      verified: true,
    })}\n`,
  );

  return 0;
}

/**
 * Wert-gebundenes Re-Decode-Verify (Premortem R3): die geschriebene Datei
 * zuruecklesen, den MThd-Header strikt parsen (Magic `MThd`, Laenge 6,
 * Format 0, ntrks 1, PPQ == Konstante) UND die Note-On-Events (Status 0x90,
 * velocity > 0) im MTrk zaehlen — muss exakt der erwarteten Notenzahl
 * entsprechen. Niemals nur Datei-Existenz.
 *
 * @param path - Pfad zur geschriebenen `.mid`-Datei.
 * @param expectedNotes - Erwartete Anzahl Noten (= Note-On-Events).
 * @returns True iff Header valide UND Note-On-Count == erwartet.
 */
function verifyWrittenSmf(path: string, expectedNotes: number): boolean {
  const b = readFileSync(path);

  if (b.length < 22) return false;

  const headOk =
    b.subarray(0, 4).toString("latin1") === "MThd" &&
    b.readUInt32BE(4) === 6 &&
    b.readUInt16BE(8) === 0 &&
    b.readUInt16BE(10) === 1 &&
    b.readUInt16BE(12) === PPQ &&
    b.subarray(14, 18).toString("latin1") === "MTrk";

  if (!headOk) return false;

  const trkLen = b.readUInt32BE(18);

  if (b.length !== 22 + trkLen) return false;

  let noteOns = 0;

  // i und i+2 sind durch die Schleifenbedingung stets im gueltigen Bereich;
  // readUInt8 liefert eine Zahl ohne Index-Unsicherheit (kein non-null-Bang).
  for (let i = 22; i < b.length - 2; i++) {
    if ((b.readUInt8(i) & 0xf0) === 0x90 && b.readUInt8(i + 2) > 0) noteOns++;
  }

  return noteOns === expectedNotes;
}
