// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
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
  allocateGrooveId,
  extractGrooveFromAgr,
  injectGrooveIntoPool,
  parseAgr,
  transformToPoolGroove,
} from "#src/automation/groove-pool/als-groove-pool.ts";
import {
  collectKeyValuePairs,
  isOnlyWindowChanged,
  locateClipWithinTrack,
  parseFlags,
  warnDuplicateKeys,
} from "./clip-patch-cli.ts";
import { singleRangeReplacement } from "./shared-cli-helpers.ts";

/** Shared Open-Set (Port 3350) guard message for the writing subcommands. */
const OPEN_SET_MSG =
  "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n";

/**
 * Spy-Seam fuer den Window-Guard-Beweis am `tune`-Aufrufer (Slice
 * ppal-window-guard, Mitigation R2): `patchGrooveTune` arbeitet auf dem
 * gesamten XML, daher ist eine Outside-Window-Mutation strukturell
 * moeglich. Tests via `vi.spyOn(grooveInternals, "patchGrooveTune")`
 * beweisen, dass der Guard am Aufruf-Punkt feuert. Default-Verhalten =
 * direkte Delegation (byte-/verhaltensgleich zu vorher).
 *
 * Hinweis: `assign` (`setClipGrooveId`) ist block-scoped — eine
 * Outside-Window-Mutation ist dort strukturell ausgeschlossen, daher
 * keine zusaetzliche Spy-Seam noetig (Charakterisierung im Test).
 */
export const grooveInternals = { patchGrooveTune };

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
  if (sub === "import") return runGrooveImport(rest);

  process.stderr.write("FEHLER: groove list|assign|tune|import\n");

  return 1;
}

/**
 * Run `groove import`: read a `.agr`, transform it into a functionally
 * correct new pool `<Groove Id="N">` (Scope A) and inject it into the
 * `.als` GroovePool.
 *
 * Pipeline: parseAgr -> extractGrooveFromAgr -> allocateGrooveId ->
 * transformToPoolGroove -> injectGrooveIntoPool -> Mitigation-B
 * (everything outside `<GroovePool>` byte-identical) -> backup + write ->
 * re-parse verify. `verified` = structural + Mitigation-B re-check; NOT
 * byte-equality to a Live GUI import (not offline reproducible — `<Name>`
 * catalog value + `<SourceContext>` are Live-environment state).
 *
 * @param rest - Argument array (without the `groove` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
function runGrooveImport(rest: string[]): number {
  const flags = parseFlags(rest);
  const alsPath = flags.als;
  const agrPath = flags.agr;
  const force = flags.force === "true";
  const nameOverride =
    flags.name != null && flags.name !== "true" ? flags.name : null;

  if (alsPath == null || agrPath == null) {
    process.stderr.write("FEHLER: --als und --agr erforderlich\n");

    return 1;
  }

  if (isSetLikelyOpen() && !force) {
    process.stderr.write(OPEN_SET_MSG);

    return 2;
  }

  const before = readAls(alsPath);
  const agrGroove = parseAgr(readFileSync(agrPath));
  const extracted = extractGrooveFromAgr(agrGroove);
  const newId = allocateGrooveId(before);
  const name = nameOverride ?? extracted.name;
  const node = transformToPoolGroove(extracted, newId, name);
  const after = injectGrooveIntoPool(before, node);

  // Mitigation-B: alles AUSSERHALB <GroovePool> byte-identisch.
  const poolRe = /<GroovePool>[\S\s]*?<\/GroovePool>/;
  const mitigationB = after.replace(poolRe, "") === before.replace(poolRe, "");

  if (!mitigationB) {
    process.stderr.write(
      "FEHLER: Mitigation-B verletzt — Aenderung ausserhalb des <GroovePool>\n",
    );

    return 1;
  }

  backupAls(alsPath);
  writeAls(alsPath, after);

  // Re-Parse-Verify: neuer <Groove Id=newId> existiert + struktureller
  // Knoten-Vergleich + Mitigation-B nach Round-Trip.
  const reread = readAls(alsPath);
  const rePool = reread.match(poolRe)?.[0] ?? "";
  const structural =
    rePool.includes(`<Groove Id="${newId}">`) &&
    rePool.includes(`<Name Value="${name}" />`) &&
    poolGrooveIds(reread).includes(newId);
  const verified =
    structural && reread.replace(poolRe, "") === before.replace(poolRe, "");

  if (!verified) {
    process.stderr.write(
      "FEHLER: Verifizierung fehlgeschlagen — neuer Groove nicht zurueckgelesen\n",
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      als: alsPath,
      agr: agrPath,
      newGrooveId: newId,
      name,
      verified,
    })}\n`,
  );

  return verified ? 0 : 1;
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
    process.stderr.write(OPEN_SET_MSG);

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
  const range = singleRangeReplacement(xml, updated, loc.start, loc.end);

  if (!isOnlyWindowChanged(xml, updated, [range])) {
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
    process.stderr.write(OPEN_SET_MSG);

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
      workingXml = grooveInternals.patchGrooveTune(
        workingXml,
        grooveId,
        key,
        value,
      );
    }
  } catch (err) {
    process.stderr.write(
      `FEHLER: ${err instanceof Error ? err.message : String(err)}\n`,
    );

    return 1;
  }

  if (
    !isOnlyWindowChanged(xml, workingXml, [
      singleRangeReplacement(xml, workingXml, loc0.start, loc0.end),
    ])
  ) {
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
