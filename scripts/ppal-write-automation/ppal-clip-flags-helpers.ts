// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  CLIP_FLAG_SPEC,
  getClipFlags,
  patchClipFlag,
} from "#src/automation/als-clip-flags.ts";
import {
  type ClipLocation,
  parseFlags,
  runClipPatchCli,
} from "./clip-patch-cli.ts";

/**
 * Run the `clip-flags get|set` subcommand (AudioClip Ram/HiQ/IsWarped/WarpMode).
 *
 * get: locate clip within track, print JSON of all flag values.
 * set: validate + patch the single `--flag <f> --value <v>` pair, enforce the
 * Open-Set guard (exit 2 without --force), Mitigation-B (only bytes within the
 * target clip block may change), backup + write, then re-parse verify.
 *
 * Thin adapter over the shared `runClipPatchCli` orchestrator — the SAME
 * Offset-Splice block reintegration (`xml.slice(0,start)+block+xml.slice(end)`)
 * and Mitigation-B window guard as `ppal-clip-settings-helpers.ts`
 * (Premortem-R1). Only the flags spec/get/patch and the singular
 * `--flag/--value` surface differ; the latter is normalized to the
 * orchestrator's positional `--key/--value` pair before delegation.
 *
 * @param rest - Argument array (without the `clip-flags` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runClipFlags(rest: string[]): number {
  const sub = rest[0];

  if (sub !== "get" && sub !== "set") {
    process.stderr.write("FEHLER: clip-flags get|set\n");

    return 1;
  }

  const flags = parseFlags(rest);
  const normalized =
    sub === "set"
      ? [sub, ...keyValueArgs(rest), "--key", flags.flag, "--value", flags.value]
      : rest;

  return runClipPatchCli(normalized, parseFlags, {
    subcommandLabel: "clip-flags",
    resultKey: "flags",
    spec: CLIP_FLAG_SPEC,
    getFn: getClipFlags,
    resolveApply: () => clipFlagsInternals.applyClipFlagPatches,
    catchApplyErrors: true,
  });
}

/**
 * Build the orchestrator argv WITHOUT the trailing flag/value pair: keep the
 * selector flags (`--als`/`--track`/`--clip`/`--force`) but drop the singular
 * `--flag`/`--value` tokens, which are re-appended as a positional
 * `--key`/`--value` pair so the shared collector parses exactly one patch.
 * @param rest - Original argument array (without the `clip-flags` token)
 * @returns Selector-only argv slice (subcommand token excluded)
 */
function keyValueArgs(rest: string[]): string[] {
  const out: string[] = [];

  for (let i = 1; i < rest.length; i++) {
    if (rest[i] === "--flag" || rest[i] === "--value") {
      i++;
      continue;
    }

    out.push(rest[i]);
  }

  return out;
}

/**
 * Apply the clip-flag patch atomically in-memory and return the WHOLE updated
 * `.als` XML. Identical Offset-Splice reintegration to
 * `applyClipSettingPatches`: the patched block is spliced back into `xml` at
 * `[loc.start, loc.end)` (NOT String.replace — Premortem-R1). Exported so the
 * Mitigation-B foreign-block proof can spy/corrupt the transform output.
 * @param xml - Raw (decompressed) `.als` XML string
 * @param loc - Absolute clip location within `xml`
 * @param pairs - Ordered flag/value patches (validated by patchClipFlag)
 * @returns The whole updated XML
 */
export function applyClipFlagPatches(
  xml: string,
  loc: ClipLocation,
  pairs: Array<{ key: string; value: string }>,
): string {
  let block = loc.block;

  for (const { key, value } of pairs) {
    block = patchClipFlag(block, key, value);
  }

  return xml.slice(0, loc.start) + block + xml.slice(loc.end);
}

/**
 * Mutable holder for the patch transform — the single spy seam for the
 * Mitigation-B foreign-block proof (vi.spyOn on this property), mirroring
 * `clipSettingsInternals` so the guard is exercised without a banned
 * self-import.
 */
export const clipFlagsInternals = { applyClipFlagPatches };
