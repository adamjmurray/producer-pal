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
  getCrossFadeAssign,
  patchCrossFadeAssign,
  patchSendPreBool,
} from "#src/automation/als-mixer-routing.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import { parseFlags } from "./clip-patch-cli.ts";

const CROSS_LABEL: Record<string, number> = { A: 0, center: 1, B: 2 };

/**
 * Run the `mixer-routing crossfade|send-pre` subcommand (offline byte-true
 * Crossfader-Zuweisung pro Midi/AudioTrack bzw. Send-Pre/Post global pro
 * Return-Id). Lean track/global-scoped Pfad analog `runTrackGroup`:
 * locate/extract → patch → Offset-Splice → backup → write → re-parse verify.
 * Open-Set-Guard (exit 2 ohne `--force`) wie `runTrackGroup`.
 * @param rest - Argument-Array ohne das `mixer-routing`-Token.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runMixerRouting(rest: string[]): number {
  const sub = rest[0];

  if (sub !== "crossfade" && sub !== "send-pre") {
    process.stderr.write("FEHLER: mixer-routing crossfade|send-pre\n");

    return 1;
  }

  const flags = parseFlags(rest);
  const alsPath = flags.als;
  const force = flags.force === "true";

  if (alsPath == null) {
    process.stderr.write("FEHLER: --als erforderlich\n");

    return 1;
  }

  if (isSetLikelyOpen() && !force) {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n",
    );

    return 2;
  }

  try {
    if (sub === "crossfade") {
      return applyCrossfade(alsPath, flags.track, flags.value);
    }

    return applySendPre(alsPath, flags["return-id"], flags.value);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    process.stderr.write(`FEHLER: ${msg}\n`);

    return 1;
  }
}

/**
 * Crossfader-Zuweisung auf einem Midi/AudioTrack setzen + re-parse-verifizieren.
 * @param alsPath - Pfad zur `.als`-Datei.
 * @param track - Anzeigename des Ziel-Tracks.
 * @param label - `A|center|B`.
 * @returns Exit-Code 0/1.
 */
function applyCrossfade(
  alsPath: string,
  track: string | undefined,
  label: string | undefined,
): number {
  if (track == null || label == null || CROSS_LABEL[label] == null) {
    process.stderr.write(
      "FEHLER: crossfade erfordert --track und --value A|center|B\n",
    );

    return 1;
  }

  const value = CROSS_LABEL[label];
  const xml = readAls(alsPath);
  const loc = locateTrackBlock(xml, track);
  const patched = patchCrossFadeAssign(loc.block, value);
  const updated = xml.slice(0, loc.index) + patched + xml.slice(loc.end);

  backupAls(alsPath);
  writeAls(alsPath, updated);

  const verify = locateTrackBlock(readAls(alsPath), track);

  // Wert-gebundenes Verify (R1): Existenz von <Manual> reicht NICHT — der
  // Tag existiert immer, ein nicht-erfolgter Patch bliebe sonst unentdeckt.
  if (getCrossFadeAssign(verify.block) !== value) {
    process.stderr.write("FEHLER: Re-Parse-Verify fehlgeschlagen\n");

    return 1;
  }

  return 0;
}

/**
 * Send-Pre/Post fuer einen Return byte-treu setzen + re-parse-verifizieren.
 * @param alsPath - Pfad zur `.als`-Datei.
 * @param idArg - Return-Id als String.
 * @param label - `pre|post`.
 * @returns Exit-Code 0/1.
 */
function applySendPre(
  alsPath: string,
  idArg: string | undefined,
  label: string | undefined,
): number {
  if (idArg == null || (label !== "pre" && label !== "post")) {
    process.stderr.write(
      "FEHLER: send-pre erfordert --return-id und --value pre|post\n",
    );

    return 1;
  }

  const returnId = Number(idArg);
  const value = label === "pre";
  const xml = readAls(alsPath);
  const updated = patchSendPreBool(xml, returnId, value);

  backupAls(alsPath);
  writeAls(alsPath, updated);

  if (
    !readAls(alsPath).includes(
      '<SendPreBool Id="' + returnId + '" Value="' + value + '" />',
    )
  ) {
    process.stderr.write("FEHLER: Re-Parse-Verify fehlgeschlagen\n");

    return 1;
  }

  return 0;
}
