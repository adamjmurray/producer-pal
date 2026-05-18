// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  CLIP_SETTING_SPEC,
  ENUM_TABLES,
  getClipSettings,
  patchClipSetting,
} from "#src/automation/als-clip-settings.ts";
import { type ClipLocation, runClipPatchCli } from "./clip-patch-cli.ts";

export {
  type ClipLocation,
  collectKeyValuePairs,
  locateClipWithinTrack,
} from "./clip-patch-cli.ts";

/**
 * Run the `clip-settings get|set` subcommand.
 *
 * get: locate clip within track, print JSON of all settings.
 * set: collect `--key/--value` pairs positionally, apply atomically, enforce
 * the Open-Set guard (exit 2 without --force), Mitigation-B (only bytes within
 * the target clip block may change), backup + write, then re-parse verify.
 *
 * Thin adapter over the shared `runClipPatchCli` orchestrator: only the
 * clip-settings spec/get/patch and the G3'-enum per-key warning differ.
 *
 * @param rest - Argument array (without the `clip-settings` token)
 * @param parseFlags - Shared flag parser from the CLI module
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runClipSettings(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  return runClipPatchCli(rest, parseFlags, {
    subcommandLabel: "clip-settings",
    resultKey: "settings",
    spec: CLIP_SETTING_SPEC,
    getFn: getClipSettings,
    resolveApply: () => clipSettingsInternals.applyClipSettingPatches,
    catchApplyErrors: false,
    perKeyWarn: warnEnumRawInteger,
  });
}

/**
 * Apply all clip-setting patches atomically in-memory and return the WHOLE
 * updated `.als` XML (single string, never written here).
 *
 * Patches are applied sequentially on one block string (one logical write);
 * the patched block is spliced back into `xml` at `[loc.start, loc.end)`.
 * Exported so the Mitigation-B foreign-block proof test can spy/corrupt the
 * transform's output.
 *
 * @param xml - Raw (decompressed) `.als` XML string
 * @param loc - Absolute clip location within `xml`
 * @param pairs - Ordered key/value patches (each validated by patchClipSetting)
 * @returns The whole updated XML
 */
export function applyClipSettingPatches(
  xml: string,
  loc: ClipLocation,
  pairs: Array<{ key: string; value: string }>,
): string {
  let block = loc.block;

  for (const { key, value } of pairs) {
    block = patchClipSetting(block, key, value);
  }

  return xml.slice(0, loc.start) + block + xml.slice(loc.end);
}

/**
 * G3'-Enum-Hinweis (T5 implementiert): Enum-Namens-Validierung ist aktiv,
 * `ENUM_TABLES` byte-belegt aus der Ground-Truth-Fixture. Ein Roh-Integer
 * bei einem enum-Key ist ein bewusst unterstützter Passthrough (auch für
 * Stufen ohne byte-belegten Namen, z. B. weitere LaunchQuantisation-Werte) —
 * daher KEINE Warnung mehr über eine fehlende Fixture. Stattdessen ein
 * informierender stderr-Hinweis, dass für diesen Key benannte Werte
 * verfügbar sind (Roh-Integer wurde ungeprüft auf Stufengültigkeit
 * übernommen, da nur eine Teilmenge byte-belegt ist).
 * @param key - Patch key
 * @param value - Patch value
 * @returns Nothing
 */
function warnEnumRawInteger(key: string, value: string): void {
  const def = CLIP_SETTING_SPEC[key];

  if (def?.type === "enum" && /^-?\d+$/.test(value)) {
    const names = ENUM_TABLES[key];
    const hint =
      names === undefined
        ? ""
        : ` Benannte Werte verfügbar: ${Object.keys(names).join(", ")}.`;

    process.stderr.write(
      `HINWEIS: Enum-Key "${key}" Roh-Integer-Wert "${value}" ` +
        `als Passthrough übernommen (Stufengültigkeit ungeprüft).${hint}\n`,
    );
  }
}

/**
 * Mutable holder for the patch transform — the single spy seam used by the
 * Mitigation-B foreign-block proof test (vi.spyOn on this property), so the
 * guard is exercised against a corrupted whole-XML result without a banned
 * self-import.
 */
export const clipSettingsInternals = { applyClipSettingPatches };
