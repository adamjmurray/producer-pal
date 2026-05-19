// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  backupAls,
  isSetLikelyOpen,
  readAls,
  writeAls,
} from "#src/automation/als-file.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import {
  getArrangementClips,
  shiftTrackArrangementClips,
  type ArrClip,
} from "#src/automation/als-shift-time.ts";
import { isOnlyWindowChanged } from "./clip-patch-cli.ts";

/**
 * Mutable Spy-Seam: Open-Set-Guard und Shift-Transform werden hierueber
 * aufgerufen, damit Tests sie ueber `vi.spyOn(shiftTimeInternals, …)` ohne
 * verbotenen Self-Import verfaelschen/forcieren koennen (Vorbild
 * `warpInternals`).
 */
export const shiftTimeInternals = {
  isSetLikelyOpen,
  shiftTrackArrangementClips,
};

/**
 * Run the `shift-time get|set` subcommand (offline byte-true Track-Clips-
 * Arrangement-Shift). Lean track-scoped Pfad analog `runWarpMarker`:
 * locate -> shift -> Offset-Splice -> Fenster-Guard -> backup -> write ->
 * wert-gebundenes Re-Parse-Verify. Open-Set-Guard (exit 2 ohne `--force`).
 *
 * @param rest - Argument-Array ohne das `shift-time`-Token.
 * @param parseFlags - Geteilter Flag-Parser aus dem CLI-Modul.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runShiftTime(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  const sub = rest[0];

  if (sub !== "get" && sub !== "set") {
    process.stderr.write("FEHLER: shift-time get|set\n");

    return 1;
  }

  const flags = parseFlags(rest);
  const alsPath = flags.als;
  const track = flags.track;

  if (alsPath == null || track == null) {
    process.stderr.write("FEHLER: --als, --track erforderlich\n");

    return 1;
  }

  if (sub === "get") {
    const loc = locateTrackBlock(readAls(alsPath), track);

    process.stdout.write(
      `${JSON.stringify({
        track,
        clips: getArrangementClips(loc.block),
      })}\n`,
    );

    return 0;
  }

  return runSet(alsPath, track, flags);
}

/**
 * Den `set`-Pfad ausfuehren: Flags pruefen, Open-Set-Guard, locate, shift
 * (Throw -> exit 1, kein Partial-Write), Fenster-Guard, backup + write,
 * wert-gebundenes Re-Parse-Verify.
 *
 * @param alsPath - Pfad zur `.als`-Datei.
 * @param track - Anzeigename des Ziel-Tracks.
 * @param flags - Geparster Flag-Map.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
function runSet(
  alsPath: string,
  track: string,
  flags: Record<string, string>,
): number {
  const fromRaw = flags["from-beat"];
  const deltaRaw = flags.delta;

  if (fromRaw == null || deltaRaw == null) {
    process.stderr.write("FEHLER: --from-beat und --delta erforderlich\n");

    return 1;
  }

  if (shiftTimeInternals.isSetLikelyOpen() && flags.force !== "true") {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n",
    );

    return 2;
  }

  const fromBeat = Number(fromRaw);
  const delta = Number(deltaRaw);
  const xml = readAls(alsPath);
  const loc = locateTrackBlock(xml, track);
  // Soll-Liste UNABHAENGIG vom (potentiell verfaelschten) Transform aus den
  // Original-Clips berechnen: id stabil, Time = startBeat>=P ? +delta : roh.
  const expected = expectedAfterShift(
    getArrangementClips(loc.block),
    fromBeat,
    delta,
  );
  let updated: string;
  let shifted: number;

  try {
    const res = shiftTimeInternals.shiftTrackArrangementClips(
      loc.block,
      fromBeat,
      delta,
    );

    updated = xml.slice(0, loc.index) + res.block + xml.slice(loc.end);
    shifted = res.shifted;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    process.stderr.write(`FEHLER: ${msg}\n`);

    return 1;
  }

  if (!isOnlyWindowChanged(xml, updated, loc.index, loc.end)) {
    process.stderr.write(
      "FEHLER: unerwartete Änderung außerhalb des Ziel-Track-Blocks\n",
    );

    return 1;
  }

  backupAls(alsPath);
  writeAls(alsPath, updated);

  return verify(alsPath, track, expected, shifted);
}

/**
 * Aus den Original-Arr-Clips die erwartete Liste NACH dem Shift berechnen
 * (rein, unabhaengig vom Transform): Clips mit startBeat>=fromBeat bekommen
 * `String(startBeat+delta)`, alle anderen ihren rohen Time-String; Id und
 * Reihenfolge bleiben. So faellt ein verfaelschter Transform-Output beim
 * Re-Parse-Vergleich auf.
 *
 * @param clips - Original-Arr-Clips (vor Write).
 * @param fromBeat - Schnittstelle P.
 * @param delta - Verschiebung D.
 * @returns Erwartete (id,time)-Paare in Dokumentreihenfolge.
 */
function expectedAfterShift(
  clips: ArrClip[],
  fromBeat: number,
  delta: number,
): { id: string; time: string }[] {
  return clips.map((c) => ({
    id: c.id,
    time: c.startBeat >= fromBeat ? String(c.startBeat + delta) : c.time,
  }));
}

/**
 * Wert-gebundenes Re-Parse-Verify (Premortem R3): die zurueckgelesene
 * Arr-Clip-Liste muss Element-fuer-Element gegen `expected` exakt stimmen
 * (Laenge, jedes Id UND Time), NICHT nur Tag-Existenz/Count.
 *
 * @param alsPath - Pfad zur geschriebenen `.als`-Datei.
 * @param track - Anzeigename des Ziel-Tracks.
 * @param expected - Unabhaengig berechnete Soll-(id,time)-Liste.
 * @param shifted - Vom Transform gemeldete Anzahl verschobener Clips.
 * @returns Exit-Code: 0 verifiziert, 1 Mismatch.
 */
function verify(
  alsPath: string,
  track: string,
  expected: { id: string; time: string }[],
  shifted: number,
): number {
  const loc = locateTrackBlock(readAls(alsPath), track);
  const actual = getArrangementClips(loc.block);
  const ok =
    Number.isInteger(shifted) &&
    shifted >= 0 &&
    actual.length === expected.length &&
    expected.every((e, i) => {
      const a = actual[i];

      return a?.id === e.id && a.time === e.time;
    });

  if (!ok) {
    process.stderr.write(
      "FEHLER: Re-Parse-Verify fehlgeschlagen (Clips != Soll)\n",
    );

    return 1;
  }

  process.stdout.write(
    `${JSON.stringify({ track, shifted, verified: true })}\n`,
  );

  return 0;
}
