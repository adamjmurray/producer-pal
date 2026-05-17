// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { locateClipBlock } from "#src/automation/als-envelope-writer.ts";
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

/** Minimal shape of a per-key spec entry needed by the shared raw-tag verify. */
interface SpecEntry {
  tag: string;
  type?: string;
}

/**
 * Configuration that distinguishes one clip-patch subcommand (clip-settings,
 * fades, …) from another. The shared orchestrator is otherwise identical:
 * collect pairs, locate clip, atomic multi-patch, Mitigation-B, backup +
 * write, re-parse + raw-tag verify, duplicate-key/duplicate-clip guards.
 */
export interface ClipPatchConfig {
  /** Subcommand token, used verbatim in usage/error strings (e.g. "fades"). */
  subcommandLabel: string;
  /** JSON key under which `get` reports the parsed values (e.g. "settings"). */
  resultKey: string;
  /** Per-key spec table (key -> { tag, type }). */
  spec: Record<string, SpecEntry>;
  /** Parse all values from a clip block. */
  getFn: (block: string) => Record<string, string>;
  /**
   * Resolve the patch transform at call time. Implementations MUST read it
   * freshly off the mutable spy-seam holder (e.g. `() => h.applyX`) so the
   * Mitigation-B foreign-block proof test's vi.spyOn is honored.
   */
  resolveApply: () => (
    xml: string,
    loc: ClipLocation,
    pairs: Array<{ key: string; value: string }>,
  ) => string;
  /**
   * If true, the apply transform is wrapped in try/catch and a thrown error
   * is reported as `FEHLER: <msg>` with exit 1 (no partial write). Used by
   * fades, where patchFade throws on invalid skew/slope/value.
   */
  catchApplyErrors: boolean;
  /**
   * Optional guard on the located clip block (e.g. AudioClip-only for fades).
   * Return an error message string to reject (exit 1), or null to allow.
   */
  clipKindGuard?: (block: string) => string | null;
  /**
   * Optional per-key warning hook (e.g. clip-settings enum warning). Called
   * once per collected pair before patching; emits to stderr itself.
   */
  perKeyWarn?: (key: string, value: string) => void;
}

/**
 * Run a clip-patch `get|set` subcommand with the given configuration.
 *
 * get: locate clip within track, print JSON of all parsed values.
 * set: collect `--key/--value` pairs positionally, apply atomically, enforce
 * the Open-Set guard (exit 2 without --force), Mitigation-B (only bytes within
 * the target clip block may change — exact Slice-2-FIX-1 Längendelta formula),
 * backup + write, then re-parse + raw-tag verify.
 *
 * @param rest - Argument array (without the subcommand token)
 * @param parseFlagsFn - Shared flag parser from the CLI module
 * @param cfg - Subcommand-specific configuration
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runClipPatchCli(
  rest: string[],
  parseFlagsFn: (argv: string[]) => Record<string, string>,
  cfg: ClipPatchConfig,
): number {
  const flags = parseFlagsFn(rest);
  const sub = rest[0];
  const alsPath = flags.als;
  const track = flags.track;
  const clip = flags.clip;
  const force = flags.force === "true";

  if (sub !== "get" && sub !== "set") {
    process.stderr.write(`FEHLER: ${cfg.subcommandLabel} get|set\n`);

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

  if (cfg.clipKindGuard != null) {
    const guardErr = cfg.clipKindGuard(loc.block);

    if (guardErr != null) {
      process.stderr.write(`${guardErr}\n`);

      return 1;
    }
  }

  if (sub === "get") {
    process.stdout.write(
      `${JSON.stringify({ track, clip, [cfg.resultKey]: cfg.getFn(loc.block) })}\n`,
    );

    return 0;
  }

  return runSet(rest, { alsPath, track, clip, xml, loc }, cfg);
}

/**
 * Parse argv flags into a key→value map (shared CLI convention: boolean flags
 * without a following token get the value "true", all others the next token).
 *
 * This is the single source of truth for the flag-parsing skeleton used by all
 * `ppal-write-automation` subcommands — passed into `runClipPatchCli` and
 * imported directly by the `groove` and top-level `write` entry points so the
 * parsing convention is not re-implemented per module.
 *
 * @param argv - Argument array (without the subcommand token)
 * @returns Record of flag names (without --) to string values
 */
export function parseFlags(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg?.startsWith("--") === true) {
      const key = arg.slice(2);
      const next = argv[i + 1];

      if (next === undefined || next.startsWith("--")) {
        result[key] = "true";
        i++;
      } else {
        result[key] = next;
        i += 2;
      }
    } else {
      i++;
    }
  }

  return result;
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

/**
 * Generic, locator-agnostic Mitigation-B guard (Slice-2-FIX-1 Längendelta).
 *
 * Asserts that the patch transform changed ONLY bytes inside the half-open
 * window `[start, end)` of the original `xml`: the prefix `[0, start)` is
 * byte-identical AND the suffix from the original `end` is byte-identical
 * (in the possibly-longer `updated` that suffix begins at `end + delta`).
 *
 * This is the exact formula used by the clip-scoped `set` path; extracted
 * here so the groove `tune` path (Pool-entry offsets via `locateGrooveEntry`)
 * can reuse it WITHOUT re-implementing the formula. Behavior of the existing
 * clip-scoped guard in `runSet` is byte-for-byte equivalent — Slice-3/4 tests
 * remain the net (unchanged).
 *
 * @param xml - Original raw `.als` XML before patching
 * @param updated - Whole XML after patching
 * @param start - Window start offset (absolute, into `xml`)
 * @param end - Window end offset (absolute, into `xml`)
 * @returns True iff only bytes within `[start, end)` changed
 */
export function isOnlyWindowChanged(
  xml: string,
  updated: string,
  start: number,
  end: number,
): boolean {
  const delta = updated.length - xml.length;

  return (
    xml.slice(0, start) === updated.slice(0, start) &&
    xml.slice(end) === updated.slice(end + delta)
  );
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
 * Execute the `set` path: collect pairs, apply atomically, Mitigation-B
 * guard, backup + write, then re-parse + raw-tag verify.
 * @param rest - Argument array (without the subcommand token)
 * @param ctx - Resolved set-context
 * @param cfg - Subcommand-specific configuration
 * @returns Exit code: 0 success, 1 error
 */
function runSet(rest: string[], ctx: SetContext, cfg: ClipPatchConfig): number {
  const { alsPath, track, clip, xml, loc } = ctx;
  const pairs = collectKeyValuePairs(rest);

  if (pairs.length === 0) {
    process.stderr.write(
      "FEHLER: mindestens ein --key <k> --value <v> Paar erforderlich\n",
    );

    return 1;
  }

  warnDuplicateKeys(pairs);

  if (cfg.perKeyWarn != null) {
    for (const { key, value } of pairs) cfg.perKeyWarn(key, value);
  }

  const before = cfg.getFn(loc.block);
  // Indirection via the caller-supplied mutable holder so vi.spyOn(...) is
  // honored by the Mitigation-B foreign-block proof (single spy seam).
  let updated: string;

  if (cfg.catchApplyErrors) {
    try {
      updated = cfg.resolveApply()(xml, loc, pairs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      process.stderr.write(`FEHLER: ${msg}\n`);

      return 1;
    }
  } else {
    updated = cfg.resolveApply()(xml, loc, pairs);
  }

  // Mitigation B (Slice-2-FIX-1-Längendelta-Formel): nur Bytes innerhalb
  // [loc.start, loc.end) dürfen sich ändern. Geteilte locator-agnostische
  // Implementierung (auch vom groove `tune`-Pfad genutzt) — Verhalten
  // byte-identisch zur vorherigen Inline-Formel.
  if (!isOnlyWindowChanged(xml, updated, loc.start, loc.end)) {
    process.stderr.write(
      "FEHLER: unerwartete Änderung außerhalb des Ziel-Clip-Blocks\n",
    );

    return 1;
  }

  backupAls(alsPath);
  writeAls(alsPath, updated);

  return verifyAndReport({ alsPath, track, clip, before }, pairs, cfg);
}

/**
 * Emit a stderr warning the first time any key is repeated. Last-write-wins
 * is the semantics; this only makes the silently-overwritten value explicit.
 * @param pairs - Ordered key/value pairs
 * @returns Nothing
 */
export function warnDuplicateKeys(
  pairs: Array<{ key: string; value: string }>,
): void {
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
}

/** Verify-context: everything needed for re-parse + raw-tag verification. */
interface VerifyContext {
  alsPath: string;
  track: string;
  clip: string;
  before: Record<string, string>;
}

/**
 * Re-load the written `.als`, re-parse the target clip and verify each
 * effective (last-write-wins) pair against both the parsed value AND the raw
 * tag string (the raw check defeats the SPEC-default masking), then print the
 * `{ track, clip, patched, verified }` JSON line.
 * @param vc - Verify-context (path, track, clip, before-snapshot)
 * @param pairs - Ordered key/value pairs (pre-dedup)
 * @param cfg - Subcommand-specific configuration
 * @returns Exit code: 0 verified, 1 verification failed
 */
function verifyAndReport(
  vc: VerifyContext,
  pairs: Array<{ key: string; value: string }>,
  cfg: ClipPatchConfig,
): number {
  const { alsPath, track, clip, before } = vc;
  const reLoc = locateClipWithinTrack(readAls(alsPath), track, clip);
  const after = cfg.getFn(reLoc.block);
  // Last-write-wins-Auflösung: bei doppeltem Key gilt nur der letzte Wert
  // (so wie der Patch-Transform sequentiell patcht) — sonst würde der Verify
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
  // Re-Parse-Verify allein maskiert: liefert der Patch den Tag nicht und ist
  // Soll == SPEC-Default, gibt getFn fälschlich den Default zurück -> ok wäre
  // true. Daher zusätzlich den ROH-Tag-String im neu geladenen Block prüfen.
  const ok = effectivePairs.every((p) => {
    const def = cfg.spec[p.key];

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
