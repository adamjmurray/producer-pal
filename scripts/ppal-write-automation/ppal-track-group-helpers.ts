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
  assertGroupExists,
  locateGroupTrackBlock,
  patchTrackField,
} from "#src/automation/als-track-group.ts";
import { parseFlags } from "./clip-patch-cli.ts";

/**
 * Run the `track-group set|fold` subcommand (offline byte-true TrackGroupId
 * assignment / TrackUnfolded toggle on an EXISTING group).
 *
 * No clip-scoped orchestrator (`runClipPatchCli`) fits here — that locator is
 * clip-scoped. This is the lean track-scoped path mandated by the plan:
 * locate → `patchTrackField` → Offset-Splice
 * (`xml.slice(0,start)+block+xml.slice(end)`, NOT String.replace —
 * Premortem-R1) → backup → write → re-parse verify. `set` targets a group
 * MEMBER track (`locateTrackBlock`, Midi/AudioTrack); `fold` targets the
 * GROUP itself (`locateGroupTrackBlock`, since `locateTrackBlock`'s
 * `TRACK_OPEN_RE` intentionally excludes GroupTrack). The Open-Set guard
 * (exit 2 without `--force`) mirrors `clip-patch-cli`/`ppal-timesig-helpers`.
 *
 * set: `--als`/`--track`/`--group` required; `assertGroupExists` BEFORE any
 * mutation; patch `TrackGroupId`.
 * fold: `--als`/`--track`/`--value` required; patch `TrackUnfolded`.
 *
 * @param rest - Argument array (without the `track-group` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runTrackGroup(rest: string[]): number {
  const sub = rest[0];

  if (sub !== "set" && sub !== "fold") {
    process.stderr.write("FEHLER: track-group set|fold\n");

    return 1;
  }

  const flags = parseFlags(rest);
  const alsPath = flags.als;
  const track = flags.track;
  const force = flags.force === "true";

  if (alsPath == null || track == null) {
    process.stderr.write("FEHLER: --als und --track erforderlich\n");

    return 1;
  }

  let field: string;
  let value: string;

  if (sub === "set") {
    const group = flags.group;

    if (group == null) {
      process.stderr.write("FEHLER: track-group set erfordert --group\n");

      return 1;
    }

    field = "TrackGroupId";
    value = group;
  } else {
    const v = flags.value;

    if (v == null) {
      process.stderr.write("FEHLER: track-group fold erfordert --value\n");

      return 1;
    }

    field = "TrackUnfolded";
    value = v;
  }

  if (isSetLikelyOpen() && !force) {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n",
    );

    return 2;
  }

  return applyTrackGroup(alsPath, track, field, value);
}

/**
 * Locate the track, validate (group existence for `TrackGroupId`), patch the
 * single scalar field, re-integrate via Offset-Splice, back up + write, then
 * re-parse and verify the new value is present in the located block.
 * @param alsPath - Path to the `.als` file to patch in place.
 * @param track - Display name of the target track.
 * @param field - `TRACK_GROUP_SPEC` field name (`TrackGroupId`/`TrackUnfolded`).
 * @param value - New scalar value for the field.
 * @returns Exit code: 0 success, 1 error.
 */
function applyTrackGroup(
  alsPath: string,
  track: string,
  field: string,
  value: string,
): number {
  try {
    const xml = readAls(alsPath);

    if (field === "TrackGroupId") assertGroupExists(xml, value);

    const loc = locateBlockForField(xml, track, field);
    const patched = patchTrackField(loc.block, field, value);
    const updated = xml.slice(0, loc.index) + patched + xml.slice(loc.end);

    backupAls(alsPath);
    writeAls(alsPath, updated);

    const verifyLoc = locateBlockForField(readAls(alsPath), track, field);

    if (!verifyLoc.block.includes("<" + field + ' Value="' + value + '"')) {
      process.stderr.write(
        `FEHLER: Re-Parse-Verify fehlgeschlagen fuer ${field}=${value}\n`,
      );

      return 1;
    }

    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    process.stderr.write(`FEHLER: ${msg}\n`);

    return 1;
  }
}

/**
 * Den passenden Block-Locator je Feld waehlen: `TrackGroupId` (set) adressiert
 * einen Gruppen-MEMBER (`locateTrackBlock`, Midi/AudioTrack); `TrackUnfolded`
 * (fold) adressiert die GRUPPE selbst (`locateGroupTrackBlock`, da
 * `locateTrackBlock`/`TRACK_OPEN_RE` GroupTrack bewusst ausschliesst). Beide
 * liefern denselben Offset-Splice-Vertrag (`index`/`end`/`block`).
 * @param xml - Dekomprimierter .als-XML-String.
 * @param track - Anzeigename des Ziel-Tracks bzw. der Ziel-Gruppe.
 * @param field - `TRACK_GROUP_SPEC`-Feld (`TrackGroupId`/`TrackUnfolded`).
 * @returns Block-Substring sowie Start-Index und exklusiver End-Index.
 */
function locateBlockForField(
  xml: string,
  track: string,
  field: string,
): { index: number; end: number; block: string } {
  if (field === "TrackUnfolded") {
    return locateGroupTrackBlock(xml, track);
  }

  return locateTrackBlock(xml, track);
}
