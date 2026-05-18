// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { FADE_SPEC, getFades, patchFade } from "#src/automation/als-fades.ts";
import { type ClipLocation, runClipPatchCli } from "./clip-patch-cli.ts";

export {
  type ClipLocation,
  collectKeyValuePairs,
  locateClipWithinTrack,
} from "./clip-patch-cli.ts";

/**
 * Run the `fades get|set` subcommand.
 *
 * get: locate clip within track, print JSON of all fade values.
 * set: collect `--key/--value` pairs positionally, apply atomically, enforce
 * the Open-Set guard (exit 2 without --force), Mitigation-B (only bytes within
 * the target clip block may change), backup + write, then re-parse verify.
 *
 * The located clip block must start with `<AudioClip` — fades only exist on
 * audio clips; a MidiClip target is rejected with a clear error (return 1).
 *
 * Thin adapter over the shared `runClipPatchCli` orchestrator: only the fade
 * spec/get/patch, the AudioClip guard and the patchFade throw-handling differ.
 *
 * @param rest - Argument array (without the `fades` token)
 * @param parseFlags - Shared flag parser from the CLI module
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runFades(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  return runClipPatchCli(rest, parseFlags, {
    subcommandLabel: "fades",
    resultKey: "fades",
    spec: FADE_SPEC,
    getFn: getFades,
    resolveApply: () => fadesInternals.applyFadePatches,
    catchApplyErrors: true,
    clipKindGuard: audioClipGuard,
    expectedValue: expectedFadeValue,
  });
}

/**
 * Normalisiert die Verify-Erwartung für den geteilten clip-patch-cli-Verify.
 *
 * `FadeInCurve` ist ein Composite-Key: `patchFade` schreibt KEINEN
 * `<FadeInCurve>`-Tag, sondern die byte-belegten `FadeInCurveSkew`-Literale
 * (`up`->`-1`, `down`->`1`). Witness-Tag ist `FadeInCurveSkew`; der Verify
 * prüft `<FadeInCurveSkew Value="<skew>" />` UND `after.FadeInCurve` (von
 * `getFades` = Skew-Literal). Daher wird der Roh-Wert `up|down` hier auf das
 * effektiv geschriebene Skew-Literal abgebildet. Alle anderen Fade-Keys sind
 * value-erhaltend -> Identität (byte-/verhaltensgleich zum Slice-4-Stand).
 * Spiegelt exakt das clip-settings-`expectedValue`-Muster — KEINE
 * clip-patch-cli.ts-Änderung nötig.
 *
 * @param key - Patch-Key
 * @param value - Roh-`--value`
 * @returns Der effektiv in die `.als` geschriebene Witness-Wert
 */
function expectedFadeValue(key: string, value: string): string {
  if (key !== "FadeInCurve") return value;

  return value === "up" ? "-1" : value === "down" ? "1" : value;
}

/**
 * Apply all fade patches atomically in-memory and return the WHOLE updated
 * `.als` XML (single string, never written here).
 *
 * Patches are applied sequentially on one block string (one logical write);
 * the patched block is spliced back into `xml` at `[loc.start, loc.end)`.
 * Exported so the Mitigation-B foreign-block proof test can spy/corrupt the
 * transform's output. patchFade wirft bei rohen FadeOut/FadeIn-Skew/Slope-
 * Keys (= Slice 4c), ungültigem FadeInCurve-Wert (≠ up|down) oder ungültigem
 * Längen-/int-Wert; das Throw wird vom Orchestrator (catchApplyErrors) als
 * FEHLER + Exit 1 behandelt, KEIN Partial-Write. Der Composite-Key
 * FadeInCurve schreibt Skew+Slope+IsDefaultFadeIn atomar in einem Block.
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
 * AudioClip-Guard: Fades existieren nur auf Audio-Clips. Ein MidiClip-Ziel
 * wird mit Klartextfehler abgelehnt statt erst im patchFade-Pfad zu werfen.
 * @param block - Located clip block
 * @returns Error message string to reject, or null to allow
 */
function audioClipGuard(block: string): string | null {
  if (!block.startsWith("<AudioClip")) {
    return "FEHLER: Audio-Fades nur für AudioClip (Clip ist MidiClip)";
  }

  return null;
}

/**
 * Mutable holder for the patch transform — the single spy seam used by the
 * Mitigation-B foreign-block proof test (vi.spyOn on this property), so the
 * guard is exercised against a corrupted whole-XML result without a banned
 * self-import.
 */
export const fadesInternals = { applyFadePatches };
