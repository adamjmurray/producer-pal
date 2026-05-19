// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { patchFadeOutCurve } from "#src/automation/als-fades-curve.ts";
import { type ClipLocation, runClipPatchCli } from "./clip-patch-cli.ts";

/** Minimal-Spec: ein Composite-Key, Witness-Tag FadeOutCurveSkew. */
const FADEOUT_CURVE_SPEC = {
  FadeOutCurve: { tag: "FadeOutCurveSkew", type: "curve" },
};

/**
 * Run the `fadeout-curve get|set` subcommand. Dünner Adapter über den
 * geteilten `runClipPatchCli` (wie `runFades`): nur Spec/get/patch, der
 * AudioClip-Guard und das Throw-Handling unterscheiden sich. KEINE
 * `clip-patch-cli.ts`-Änderung — Composite-Verify über den `expectedValue`-
 * Hook (FadeOutCurve `up`→`-1`/`down`→`1`, Witness FadeOutCurveSkew).
 * @param rest - Argument-Array ohne das `fadeout-curve`-Token.
 * @param parseFlags - Geteilter Flag-Parser.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runFadeoutCurve(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  return runClipPatchCli(rest, parseFlags, {
    subcommandLabel: "fadeout-curve",
    resultKey: "fadeoutCurve",
    spec: FADEOUT_CURVE_SPEC,
    getFn: getFadeOutCurveRecord,
    resolveApply: () => fadeoutCurveInternals.applyFadeOutCurvePatch,
    catchApplyErrors: true,
    clipKindGuard: audioClipGuard,
    expectedValue: expectedFadeOutCurveValue,
  });
}

/**
 * getFn-Adapter: liefert die Record-Form die `runClipPatchCli`s Verify
 * erwartet — EXAKT das 4b-`getFades.FadeInCurve`-Muster: der Witness-Wert
 * ist das **rohe `FadeOutCurveSkew`-Literal** (`-1`/`1`/`0`), NICHT `up|down`.
 * Der geteilte Verify prüft `<FadeOutCurveSkew Value="<want>" />` im Block
 * UND `after.FadeOutCurve === <want>`; beide müssen das Skew-Literal sein.
 * @param block - Located clip block.
 * @returns Record `{ FadeOutCurve: <skew-literal> }`.
 */
function getFadeOutCurveRecord(block: string): Record<string, string> {
  const m = block.match(/<FadeOutCurveSkew Value="([^"]*)" \/>/);

  return { FadeOutCurve: m?.[1] ?? "0" };
}

/**
 * Verify-Erwartung: Composite `FadeOutCurve` → effektiv geschriebenes
 * Skew-Literal (`up`→`-1`, `down`→`1`); sonst Identität. Spiegelt exakt
 * das `ppal-fades-helpers`-`expectedFadeValue`-Muster (up→"-1"/down→"1")
 * — KEINE clip-patch-cli.ts-Änderung. Konsistent mit `getFadeOutCurveRecord`
 * (beide Skew-Literal-Wertraum).
 * @param key - Patch-Key.
 * @param value - Roh-`--value`.
 * @returns Der erwartete Witness-Wert (Skew-Literal).
 */
function expectedFadeOutCurveValue(key: string, value: string): string {
  if (key !== "FadeOutCurve") {
    return value;
  }

  return value === "up" ? "-1" : value === "down" ? "1" : value;
}

/**
 * Patch-Transform: FadeOutCurve-Composite atomar auf dem Clip-Block,
 * Offset-Splice ins ganze XML. Spy-Seam via `fadeoutCurveInternals`.
 * @param xml - Raw (decompressed) `.als` XML.
 * @param loc - Absolute Clip-Location.
 * @param pairs - Geordnete Key/Value-Patches.
 * @returns Das ganze aktualisierte XML.
 */
export function applyFadeOutCurvePatch(
  xml: string,
  loc: ClipLocation,
  pairs: Array<{ key: string; value: string }>,
): string {
  let block = loc.block;

  for (const { value } of pairs) {
    block = patchFadeOutCurve(block, value);
  }

  return xml.slice(0, loc.start) + block + xml.slice(loc.end);
}

/**
 * AudioClip-Guard: FadeOut-Kurve existiert nur auf Audio-Clips.
 * @param block - Located clip block.
 * @returns Fehlertext zum Ablehnen oder null.
 */
function audioClipGuard(block: string): string | null {
  if (!block.startsWith("<AudioClip")) {
    return "FEHLER: FadeOut-Kurve nur fuer AudioClip (Clip ist MidiClip)";
  }

  return null;
}

/** Mutable Spy-Seam (wie `fadesInternals`) für den Mitigation-B-Test. */
export const fadeoutCurveInternals = { applyFadeOutCurvePatch };
