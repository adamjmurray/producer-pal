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
import {
  getWarpMarkers,
  patchWarpMarkers,
  type WarpMarker,
} from "#src/automation/als-warp-markers.ts";
import {
  isOnlyWindowChanged,
  locateClipWithinTrack,
} from "./clip-patch-cli.ts";

/**
 * Mutable Spy-Seam: Open-Set-Guard und Patch-Transform werden hierueber
 * aufgerufen, damit Tests sie ueber `vi.spyOn(warpInternals, …)` ohne
 * verbotenen Self-Import verfaelschen/forcieren koennen.
 */
export const warpInternals = { isSetLikelyOpen, patchWarpMarkers };

/**
 * Run the `warp-marker get|set` subcommand (offline byte-true WarpMarker-
 * Liste eines Ziel-AudioClips). Lean clip-scoped Pfad analog
 * `runMixerRouting`: locate -> patch -> Offset-Splice -> backup -> write ->
 * wert-gebundenes Re-Parse-Verify. Open-Set-Guard (exit 2 ohne `--force`).
 *
 * @param rest - Argument-Array ohne das `warp-marker`-Token.
 * @param parseFlags - Geteilter Flag-Parser aus dem CLI-Modul.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runWarpMarker(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  const sub = rest[0];

  if (sub !== "get" && sub !== "set") {
    process.stderr.write("FEHLER: warp-marker get|set\n");

    return 1;
  }

  const flags = parseFlags(rest);
  const alsPath = flags.als;
  const track = flags.track;
  const clip = flags.clip;

  if (alsPath == null || track == null || clip == null) {
    process.stderr.write("FEHLER: --als, --track, --clip erforderlich\n");

    return 1;
  }

  if (sub === "get") {
    const loc = locateClipWithinTrack(readAls(alsPath), track, clip);

    process.stdout.write(
      `${JSON.stringify({
        track,
        clip,
        warpMarkers: getWarpMarkers(loc.block),
      })}\n`,
    );

    return 0;
  }

  return runSet(alsPath, track, clip, flags);
}

/**
 * Den `set`-Pfad ausfuehren: Marker parsen, Open-Set-Guard, locate,
 * AudioClip-Guard, patch (Throw -> exit 1, kein Partial-Write),
 * Fenster-Guard, backup + write, wert-gebundenes Re-Parse-Verify.
 *
 * @param alsPath - Pfad zur `.als`-Datei.
 * @param track - Anzeigename des Ziel-Tracks.
 * @param clip - Name des Ziel-Clips.
 * @param flags - Geparster Flag-Map.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
function runSet(
  alsPath: string,
  track: string,
  clip: string,
  flags: Record<string, string>,
): number {
  const markers = parseMarkers(flags.markers);

  if (markers == null) {
    process.stderr.write(
      'FEHLER: --markers "beat:sec,beat:sec,…" erforderlich\n',
    );

    return 1;
  }

  if (warpInternals.isSetLikelyOpen() && flags.force !== "true") {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n",
    );

    return 2;
  }

  const xml = readAls(alsPath);
  const loc = locateClipWithinTrack(xml, track, clip);

  if (!loc.block.startsWith("<AudioClip")) {
    process.stderr.write(
      "FEHLER: Warp-Marker nur fuer AudioClip (Clip ist MidiClip)\n",
    );

    return 1;
  }

  let updated: string;

  try {
    const patched = warpInternals.patchWarpMarkers(loc.block, markers);

    updated = xml.slice(0, loc.start) + patched + xml.slice(loc.end);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    process.stderr.write(`FEHLER: ${msg}\n`);

    return 1;
  }

  if (!isOnlyWindowChanged(xml, updated, loc.start, loc.end)) {
    process.stderr.write(
      "FEHLER: unerwartete Änderung außerhalb des Ziel-Clip-Blocks\n",
    );

    return 1;
  }

  backupAls(alsPath);
  writeAls(alsPath, updated);

  return verify(alsPath, track, clip, markers);
}

/**
 * Wert-gebundenes Re-Parse-Verify (Premortem R3): die zurueckgelesene
 * Marker-Liste muss Element-fuer-Element gegen `expected` exakt stimmen
 * (Laenge, jedes secTime UND beatTime), und die Roh-Id-Sequenz im Block
 * muss dicht 0..n-1 sein. NIEMALS nur Tag-Existenz.
 *
 * @param alsPath - Pfad zur geschriebenen `.als`-Datei.
 * @param track - Anzeigename des Ziel-Tracks.
 * @param clip - Name des Ziel-Clips.
 * @param expected - Erwartete Marker-Liste (= geschriebene Werte).
 * @returns Exit-Code: 0 verifiziert, 1 Mismatch.
 */
function verify(
  alsPath: string,
  track: string,
  clip: string,
  expected: WarpMarker[],
): number {
  const reLoc = locateClipWithinTrack(readAls(alsPath), track, clip);
  const actual = getWarpMarkers(reLoc.block);
  const ids = [...reLoc.block.matchAll(/<WarpMarker Id="(\d+)"/g)].map((m) =>
    Number(m[1]),
  );
  const idsDense =
    ids.length === expected.length && ids.every((v, i) => v === i);
  const ok =
    idsDense &&
    actual.length === expected.length &&
    expected.every((e, i) => {
      const m = actual[i];

      return m?.secTime === e.secTime && m.beatTime === e.beatTime;
    });

  if (!ok) {
    process.stderr.write(
      "FEHLER: Re-Parse-Verify fehlgeschlagen (Marker != Soll)\n",
    );

    return 1;
  }

  process.stdout.write(
    `${JSON.stringify({ track, clip, warpMarkers: actual, verified: true })}\n`,
  );

  return 0;
}

/**
 * `--markers "beat:sec,beat:sec,…"` per reinem String-Split parsen (NIE
 * Number — Float-Literale werden woertlich an `patchWarpMarkers` gereicht).
 *
 * @param raw - Roher `--markers`-Flag-Wert (oder undefined).
 * @returns Marker-Liste oder `null` bei fehlendem/leerem Flag.
 */
function parseMarkers(raw: string | undefined): WarpMarker[] | null {
  if (raw == null || raw === "true" || raw.trim() === "") {
    return null;
  }

  const markers: WarpMarker[] = [];

  for (const part of raw.split(",")) {
    const idx = part.indexOf(":");

    if (idx < 0) {
      return null;
    }

    markers.push({
      beatTime: part.slice(0, idx),
      secTime: part.slice(idx + 1),
    });
  }

  return markers;
}
