// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { locateClipBlock } from "#src/automation/als-envelope-writer.ts";
import { FADE_SPEC, getFades, patchFade } from "#src/automation/als-fades.ts";
import {
  readAls,
  writeAls,
  backupAls,
  isSetLikelyOpen,
} from "#src/automation/als-file.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";

/** Absolute byte range + text of a clip block within the whole .als XML. */
export interface ClipLocation {
  start: number;
  end: number;
  block: string;
}

/**
 * Run the `fades get|set` subcommand.
 *
 * get: locate clip within track, print JSON of all fade values.
 * set: collect `--key/--value` pairs positionally, apply atomically, enforce
 * the Open-Set guard (exit 2 without --force), Mitigation-B (only bytes within
 * the target clip block may change — exact Slice-2-FIX-1 Längendelta formula,
 * mirrored from runClipSettings), backup + write, then re-parse verify.
 *
 * The located clip block must start with `<AudioClip` — fades only exist on
 * audio clips; a MidiClip target is rejected with a clear error (return 1).
 *
 * @param rest - Argument array (without the `fades` token)
 * @param parseFlags - Shared flag parser from the CLI module
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runFades(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  const flags = parseFlags(rest);
  const sub = rest[0];
  const alsPath = flags.als;
  const track = flags.track;
  const clip = flags.clip;
  const force = flags.force === "true";

  if (sub !== "get" && sub !== "set") {
    process.stderr.write("FEHLER: fades get|set\n");

    return 1;
  }

  if (alsPath == null || track == null || clip == null) {
    process.stderr.write("FEHLER: --als, --track, --clip erforderlich\n");

    return 1;
  }

  if (sub === "set" && isSetLikelyOpen() && !force) {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n",
    );

    return 2;
  }

  const xml = readAls(alsPath);
  const loc = locateClipWithinTrack(xml, track, clip);

  // AudioClip-Guard: Fades existieren nur auf Audio-Clips. Ein MidiClip-Ziel
  // wird mit Klartextfehler abgelehnt statt erst im patchFade-Pfad zu werfen.
  if (!loc.block.startsWith("<AudioClip")) {
    process.stderr.write(
      "FEHLER: Audio-Fades nur für AudioClip (Clip ist MidiClip)\n",
    );

    return 1;
  }

  if (sub === "get") {
    process.stdout.write(
      `${JSON.stringify({ track, clip, fades: getFades(loc.block) })}\n`,
    );

    return 0;
  }

  return runFadesSet(rest, { alsPath, track, clip, xml, loc });
}

/**
 * Apply all fade patches atomically in-memory and return the WHOLE updated
 * `.als` XML (single string, never written here).
 *
 * Patches are applied sequentially on one block string (one logical write);
 * the patched block is spliced back into `xml` at `[loc.start, loc.end)`.
 * Exported so the Mitigation-B foreign-block proof test can spy/corrupt the
 * transform's output (mirrors `applyClipSettingPatches`'s role).
 *
 * @param xml - Raw (decompressed) `.als` XML string
 * @param loc - Absolute clip location within `xml`
 * @param pairs - Ordered key/value patches (each validated by patchFade)
 * @returns The whole updated XML
 */
export function applyFadePatches(
  xml: string,
  loc: ClipLocation,
  pairs: Array<{ key: string; value: string }>,
): string {
  let block = loc.block;

  for (const { key, value } of pairs) {
    block = patchFade(block, key, value);
  }

  return xml.slice(0, loc.start) + block + xml.slice(loc.end);
}

/**
 * Locate a clip by name strictly within a named track's block, returning
 * absolute offsets into the whole `xml`.
 *
 * Resolves the track via the canonical `locateTrackBlock`, then the clip via
 * `locateClipBlock` INSIDE that track block, translating the track-relative
 * clip offsets back to absolute `xml` offsets. Rejects a duplicate clip name
 * within the track AND a duplicate TRACK name with a clear error instead of
 * silently picking the first match (no stille Erst-Auswahl) — symmetric to the
 * clip-duplicate guard. Track-name counting uses `locateTrackBlock`'s `names`
 * list, which is built from the canonical `extractTrackName` logic (UserName
 * preferred over EffectiveName) — no second name-matching copy.
 *
 * @param xml - Raw (decompressed) `.als` XML string
 * @param track - Display name of the target track
 * @param clip - Exact value of the clip's `<Name Value="..." />` attribute
 * @returns Absolute `{ start, end, block }` of the clip within `xml`
 * @throws {Error} If track/clip not found or the clip name is ambiguous
 */
export function locateClipWithinTrack(
  xml: string,
  track: string,
  clip: string,
): ClipLocation {
  const t = locateTrackBlock(xml, track);
  const trackOccurrences = t.names.filter((n) => n === track).length;

  if (trackOccurrences > 1) {
    throw new Error(
      `Track "${track}" mehrfach (${trackOccurrences}x) — ` +
        `mehrdeutig, keine stille Auswahl`,
    );
  }

  const namePattern = `<Name Value="${clip}" />`;
  const occurrences = t.block.split(namePattern).length - 1;

  if (occurrences > 1) {
    throw new Error(
      `Clip "${clip}" kommt im Track "${track}" mehrfach vor ` +
        `(${occurrences}x) — Name mehrdeutig, keine stille Auswahl`,
    );
  }

  const rel = locateClipBlock(t.block, clip);

  return {
    start: t.index + rel.start,
    end: t.index + rel.end,
    block: rel.block,
  };
}

/**
 * Collect positional `--key <k> --value <v>` pairs from the raw arg list.
 * Parsed positionally (NOT via parseFlags) so repeated keys are preserved.
 * @param rest - Argument array (without the subcommand token)
 * @returns Ordered list of key/value pairs
 */
export function collectKeyValuePairs(
  rest: string[],
): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string }> = [];

  for (let i = 0; i < rest.length; i++) {
    const key = rest[i + 1];
    const value = rest[i + 3];

    if (
      rest[i] === "--key" &&
      rest[i + 2] === "--value" &&
      key != null &&
      value != null
    ) {
      pairs.push({ key, value });
    }
  }

  return pairs;
}

/** Resolved set-context shared between dispatch and the set worker. */
interface SetContext {
  alsPath: string;
  track: string;
  clip: string;
  xml: string;
  loc: ClipLocation;
}

/**
 * Execute the `fades set` path: collect pairs, apply atomically,
 * Mitigation-B guard, backup + write, then re-parse verify.
 * @param rest - Argument array (without the `fades` token)
 * @param ctx - Resolved set-context
 * @returns Exit code: 0 success, 1 error
 */
function runFadesSet(rest: string[], ctx: SetContext): number {
  const { alsPath, track, clip, xml, loc } = ctx;
  const pairs = collectKeyValuePairs(rest);

  if (pairs.length === 0) {
    process.stderr.write(
      "FEHLER: mindestens ein --key <k> --value <v> Paar erforderlich\n",
    );

    return 1;
  }

  // Doppelte Keys: last-write-wins (kein Fehler), aber explizit warnen statt
  // still den ersten Wert zu verschlucken.
  const seen = new Set<string>();
  const warned = new Set<string>();

  for (const { key } of pairs) {
    if (seen.has(key) && !warned.has(key)) {
      process.stderr.write(
        `WARNUNG: Key "${key}" mehrfach angegeben — letzter Wert gewinnt\n`,
      );
      warned.add(key);
    }

    seen.add(key);
  }

  const before = getFades(loc.block);
  // Indirection via a mutable holder so vi.spyOn(...) is honored by the
  // Mitigation-B foreign-block proof (spy seam, mirrors the
  // applyClipSettingPatches cross-module seam in the clip-settings path).
  // patchFade wirft bei Skew/Slope/ungültigem Wert -> catch -> return 1,
  // KEIN Partial-Write (writeAls erst nach erfolgreichem Transform).
  let updated: string;

  try {
    updated = fadesInternals.applyFadePatches(xml, loc, pairs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    process.stderr.write(`FEHLER: ${msg}\n`);

    return 1;
  }

  // Mitigation B (Slice-2-FIX-1-Längendelta-Formel, exakt wie
  // runClipSettings): nur Bytes innerhalb [loc.start, loc.end) dürfen sich
  // ändern. Prefix [0, loc.start) identisch UND der Suffix ab loc.end
  // identisch — im (ggf. längeren) updated beginnt dieser Suffix bei
  // loc.end + Längendelta.
  const delta = updated.length - xml.length;

  if (
    xml.slice(0, loc.start) !== updated.slice(0, loc.start) ||
    xml.slice(loc.end) !== updated.slice(loc.end + delta)
  ) {
    process.stderr.write(
      "FEHLER: unerwartete Änderung außerhalb des Ziel-Clip-Blocks\n",
    );

    return 1;
  }

  backupAls(alsPath);
  writeAls(alsPath, updated);

  // Re-parse-Verify: gepatchte Roh-Werte zurückgelesen == Soll.
  const reLoc = locateClipWithinTrack(readAls(alsPath), track, clip);
  const after = getFades(reLoc.block);
  // Last-write-wins-Auflösung: bei doppeltem Key gilt nur der letzte Wert
  // (so wie applyFadePatches sequentiell patcht) — sonst würde der Verify
  // den verworfenen Erstwert prüfen und fälschlich fehlschlagen.
  const effective = new Map<string, string>();

  for (const p of pairs) effective.set(p.key, p.value);
  const effectivePairs = [...effective].map(([key, value]) => ({
    key,
    value,
  }));
  const patched = effectivePairs.map((p) => ({
    key: p.key,
    old: before[p.key],
    new: after[p.key],
  }));
  // Re-Parse-Verify allein maskiert: liefert patchFade den Tag nicht und ist
  // Soll == SPEC-Default, gibt getFades fälschlich den Default zurück -> ok
  // wäre true. Daher zusätzlich den ROH-Tag-String im neu geladenen
  // Clip-Block prüfen.
  const ok = effectivePairs.every((p) => {
    const def = FADE_SPEC[p.key];

    return (
      def != null &&
      reLoc.block.includes(`<${def.tag} Value="${p.value}" />`) &&
      after[p.key] === p.value
    );
  });

  if (!ok) {
    process.stderr.write(
      "FEHLER: Verifizierung fehlgeschlagen — zurückgelesene Werte != Soll\n",
    );
  }

  process.stdout.write(
    `${JSON.stringify({ track, clip, patched, verified: ok })}\n`,
  );

  return ok ? 0 : 1;
}

/**
 * Mutable holder for the patch transform — the single spy seam used by the
 * Mitigation-B foreign-block proof test (vi.spyOn on this property), so the
 * guard is exercised against a corrupted whole-XML result without a banned
 * self-import.
 */
export const fadesInternals = { applyFadePatches };
