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
  listGrooves,
  locateGrooveEntry,
  patchGrooveTune,
  poolGrooveIds,
  setClipGrooveId,
} from "#src/automation/als-groove.ts";
import {
  collectKeyValuePairs,
  isOnlyWindowChanged,
  locateClipWithinTrack,
  parseFlags,
  warnDuplicateKeys,
} from "./clip-patch-cli.ts";

/**
 * Run the `groove list|assign|tune` subcommand.
 *
 * list: read-only — parse the GroovePool and print the entries as JSON
 * (no Open-Set guard, no write).
 *
 * assign: set a clip's `<GrooveId>` (clip-scoped, one-key patch). Reuses the
 * shared `locateClipWithinTrack` (track/clip-duplicate guards), `setClipGrooveId`
 * and the shared `isOnlyWindowChanged` Mitigation-B guard from
 * `clip-patch-cli.ts` — nothing re-implemented. Pool-consistency: the target
 * id must be `-1` (clear) or an existing pool id, else dangling is rejected
 * (exit 1).
 *
 * tune: patch one or more amount keys of an existing pool entry (Pool-scoped).
 * Reuses `collectKeyValuePairs` (positional, duplicate-key warning) and the
 * shared `isOnlyWindowChanged` guard with `locateGrooveEntry` offsets.
 *
 * @param rest - Argument array (without the `groove` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runGroove(rest: string[]): number {
  const sub = rest[0];

  if (sub === "list") return runGrooveList(rest);
  if (sub === "assign") return runGrooveAssign(rest);
  if (sub === "tune") return runGrooveTune(rest);

  process.stderr.write("FEHLER: groove list|assign|tune\n");

  return 1;
}

/**
 * Run `groove list`: parse the GroovePool of the given `.als` and print the
 * entries as a JSON line. Read-only — no Open-Set guard, no write.
 * @param rest - Argument array (without the `groove` token)
 * @returns Exit code: 0 success, 1 error
 */
function runGrooveList(rest: string[]): number {
  const flags = parseFlags(rest);
  const alsPath = flags.als;

  if (alsPath == null) {
    process.stderr.write("FEHLER: --als erforderlich\n");

    return 1;
  }

  const xml = readAls(alsPath);

  process.stdout.write(`${JSON.stringify({ grooves: listGrooves(xml) })}\n`);

  return 0;
}

/**
 * Run `groove assign`: set a clip's `<GrooveId>` to a pool id or `-1`.
 *
 * Open-Set guard (exit 2 without --force), pool-consistency check (dangling
 * id rejected, exit 1), shared clip locator + `setClipGrooveId`, shared
 * Mitigation-B (only the target clip block may change), backup + write,
 * re-parse verify.
 *
 * @param rest - Argument array (without the `groove` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
function runGrooveAssign(rest: string[]): number {
  const flags = parseFlags(rest);
  const alsPath = flags.als;
  const track = flags.track;
  const clip = flags.clip;
  const grooveId = flags["groove-id"];
  const force = flags.force === "true";

  if (alsPath == null || track == null || clip == null || grooveId == null) {
    process.stderr.write(
      "FEHLER: --als, --track, --clip, --groove-id erforderlich\n",
    );

    return 1;
  }

  if (isSetLikelyOpen() && !force) {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n",
    );

    return 2;
  }

  const xml = readAls(alsPath);
  const ids = poolGrooveIds(xml);

  if (grooveId !== "-1" && !ids.includes(grooveId)) {
    process.stderr.write(
      `FEHLER: GrooveId ${grooveId} nicht im Pool, verfügbar: ` +
        `${ids.join(", ")}\n`,
    );

    return 1;
  }

  const loc = locateClipWithinTrack(xml, track, clip);
  const patchedBlock = setClipGrooveId(loc.block, grooveId);
  const updated = xml.slice(0, loc.start) + patchedBlock + xml.slice(loc.end);

  if (!isOnlyWindowChanged(xml, updated, loc.start, loc.end)) {
    process.stderr.write(
      "FEHLER: unerwartete Änderung außerhalb des Ziel-Clip-Blocks\n",
    );

    return 1;
  }

  backupAls(alsPath);
  writeAls(alsPath, updated);

  const reLoc = locateClipWithinTrack(readAls(alsPath), track, clip);
  const ok = reLoc.block.includes(`<GrooveId Value="${grooveId}" />`);

  if (!ok) {
    process.stderr.write(
      "FEHLER: Verifizierung fehlgeschlagen — GrooveId nicht zurückgelesen\n",
    );
  }

  process.stdout.write(
    `${JSON.stringify({ track, clip, grooveId, verified: ok })}\n`,
  );

  return ok ? 0 : 1;
}

/**
 * Run `groove tune`: patch one or more amount keys of an existing pool entry.
 *
 * Pool-scoped: `locateGrooveEntry` resolves the entry; `patchGrooveTune`
 * patches sequentially on the whole xml (atomic, no partial write — a throw
 * aborts before any write). Shared `collectKeyValuePairs` (positional,
 * duplicate-key warning), Open-Set guard, shared Mitigation-B with the
 * groove-entry offsets, backup + write, re-parse verify.
 *
 * @param rest - Argument array (without the `groove` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
function runGrooveTune(rest: string[]): number {
  const flags = parseFlags(rest);
  const alsPath = flags.als;
  const grooveId = flags["groove-id"];
  const force = flags.force === "true";

  if (alsPath == null || grooveId == null) {
    process.stderr.write("FEHLER: --als, --groove-id erforderlich\n");

    return 1;
  }

  if (isSetLikelyOpen() && !force) {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n",
    );

    return 2;
  }

  const pairs = collectKeyValuePairs(rest);

  if (pairs.length === 0) {
    process.stderr.write(
      "FEHLER: mindestens ein --key <k> --value <v> Paar erforderlich\n",
    );

    return 1;
  }

  warnDuplicateKeys(pairs);

  const xml = readAls(alsPath);
  let loc0;

  try {
    loc0 = locateGrooveEntry(xml, grooveId);
  } catch (err) {
    process.stderr.write(
      `FEHLER: ${err instanceof Error ? err.message : String(err)}\n`,
    );

    return 1;
  }

  let workingXml = xml;

  try {
    for (const { key, value } of pairs) {
      workingXml = patchGrooveTune(workingXml, grooveId, key, value);
    }
  } catch (err) {
    process.stderr.write(
      `FEHLER: ${err instanceof Error ? err.message : String(err)}\n`,
    );

    return 1;
  }

  if (!isOnlyWindowChanged(xml, workingXml, loc0.start, loc0.end)) {
    process.stderr.write(
      "FEHLER: unerwartete Änderung außerhalb des Ziel-Groove-Eintrags\n",
    );

    return 1;
  }

  backupAls(alsPath);
  writeAls(alsPath, workingXml);

  const effective = new Map<string, string>();

  for (const p of pairs) effective.set(p.key, p.value);

  const reBlock = locateGrooveEntry(readAls(alsPath), grooveId).block;
  const ok = [...effective].every(([key, value]) =>
    reBlock.includes(`<${key} Value="${value}" />`),
  );

  if (!ok) {
    process.stderr.write(
      "FEHLER: Verifizierung fehlgeschlagen — Werte nicht zurückgelesen\n",
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      grooveId,
      patched: [...effective].map(([key, value]) => ({ key, value })),
      verified: ok,
    })}\n`,
  );

  return ok ? 0 : 1;
}
