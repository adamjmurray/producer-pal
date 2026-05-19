#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { injectArrangementEnvelope } from "#src/automation/als-arrangement-writer.ts";
import {
  injectClipEnvelope,
  locateClipBlock,
} from "#src/automation/als-envelope-writer.ts";
import {
  readAls,
  writeAls,
  backupAls,
  isSetLikelyOpen,
  assertOnlyEnvelopeChanged,
} from "#src/automation/als-file.ts";
import {
  listDeviceParams,
  locateTrackBlock,
  resolveAutomationTargetId,
  resolveMixerTarget,
  type AlsParam,
} from "#src/automation/als-param-resolver.ts";
import { parseBreakpoints } from "#src/automation/breakpoint-parser.ts";
import { validateBreakpoints } from "#src/automation/breakpoint-validator.ts";
import { parseFlags } from "./clip-patch-cli.ts";
import { runClipFlags } from "./ppal-clip-flags-helpers.ts";
import { runClipSettings } from "./ppal-clip-settings-helpers.ts";
import { runFadeoutCurve } from "./ppal-fadeout-curve-helpers.ts";
import { runFades } from "./ppal-fades-helpers.ts";
import { runGroove } from "./ppal-groove-helpers.ts";
import { runMixerRouting } from "./ppal-mixer-routing-helpers.ts";
import { runModulation } from "./ppal-modulation-helpers.ts";
import { runTempo } from "./ppal-tempo-helpers.ts";
import { runTimesig } from "./ppal-timesig-helpers.ts";
import { runTrackGroup } from "./ppal-track-group-helpers.ts";

/** Parsed arguments for the `write` subcommand. */
interface WriteArgs {
  als: string;
  track: string;
  clip: string;
  param: string;
  device: number;
  breakpoints: string;
  targetId: string | null;
  force: boolean;
}

/**
 * Run the `list` subcommand: print automation params for a track device.
 * @param flags - Parsed flag map
 * @returns Exit code (0 on success, 1 on error)
 */
function runList(flags: Record<string, string>): number {
  const alsPath = flags.als;
  const trackName = flags.track;

  if (alsPath == null || trackName == null) {
    process.stderr.write("FEHLER: --als und --track sind erforderlich\n");

    return 1;
  }

  const deviceIndex = flags.device != null ? Number(flags.device) : 0;
  const xml = readAls(alsPath);
  const params = listDeviceParams(xml, trackName, deviceIndex);

  for (const p of params) {
    process.stdout.write(
      `${p.element}\tid=${p.automationTargetId}\tmin=${p.min}\tmax=${p.max}\tmanual=${p.manual}\n`,
    );
  }

  return 0;
}

/**
 * Parse the `write` subcommand arguments from the flag map.
 * @param flags - Parsed flag map
 * @returns Parsed WriteArgs or null if required flags are missing
 */
function parseWriteArgs(flags: Record<string, string>): WriteArgs | null {
  const als = flags.als;
  const track = flags.track;
  const clip = flags.clip;
  const param = flags.param;
  const breakpoints = flags.breakpoints;

  if (
    als == null ||
    track == null ||
    clip == null ||
    param == null ||
    breakpoints == null
  ) {
    return null;
  }

  return {
    als,
    track,
    clip,
    param,
    device: flags.device != null ? Number(flags.device) : 0,
    breakpoints,
    targetId: flags["target-id"] ?? null,
    force: flags.force === "true",
  };
}

/**
 * Run the `write` subcommand: inject automation breakpoints into a clip.
 * @param flags - Parsed flag map
 * @returns Exit code (0 on success, 1 on error, 2 on open-set guard)
 */
function runWrite(flags: Record<string, string>): number {
  const scopeError = checkScope(flags);

  if (scopeError != null) return scopeError;

  if ((flags.scope ?? "clip") === "arrangement") {
    return runWriteArrangement(flags);
  }

  const args = parseWriteArgs(flags);

  if (args == null) {
    process.stderr.write(
      "FEHLER: --als, --track, --clip, --param und --breakpoints sind erforderlich\n",
    );

    return 1;
  }

  const xml = readAls(args.als);

  // Resolve param
  let resolvedParam;
  let targetId: string;

  if (args.targetId != null) {
    targetId = args.targetId;

    // Try to get min/max for range validation
    try {
      const params = listDeviceParams(xml, args.track, args.device);
      const matched = params.find(
        (p) => p.automationTargetId === args.targetId,
      );

      resolvedParam = matched ?? null;
    } catch {
      resolvedParam = null;
    }
  } else {
    resolvedParam = resolveAutomationTargetId(
      xml,
      args.track,
      args.device,
      args.param,
    );
    targetId = resolvedParam.automationTargetId;
  }

  // Parse breakpoints (comma-separated t=v → newline form)
  const bpInput = args.breakpoints.replaceAll(",", "\n");
  const parsed = parseBreakpoints(bpInput);

  // Validate with range if available
  const min = resolvedParam?.min ?? null;
  const max = resolvedParam?.max ?? null;

  const validated =
    min != null && max != null
      ? validateBreakpoints(parsed, { min, max })
      : validateBreakpoints(parsed, { min: -Infinity, max: Infinity });

  // Open-set guard
  if (!args.force && isSetLikelyOpen()) {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n",
    );

    return 2;
  }

  const bakPath = backupAls(args.als);
  const before = xml;
  const after = injectClipEnvelope(before, args.clip, targetId, validated);

  assertOnlyEnvelopeChanged(before, after, args.clip);
  writeAls(args.als, after);

  // Verify the written file — scoped to the injected clip block
  const readBackXml = readAls(args.als);
  const clipLoc = locateClipBlock(readBackXml, args.clip);
  const clipBlock = clipLoc.block;
  const pointeeCheck = `<PointeeId Value="${targetId}" />`;

  if (!clipBlock.includes(pointeeCheck)) {
    process.stderr.write(
      `FEHLER: Verifizierung fehlgeschlagen — PointeeId ${targetId} nicht im Clip gefunden\n`,
    );

    return 1;
  }

  const floatEventCount = [...clipBlock.matchAll(/<FloatEvent /g)].length;
  // Expected: user breakpoints + 1 anchor event at Time=-63072000
  const expectedFloatEvents = validated.length + 1;

  if (floatEventCount !== expectedFloatEvents) {
    process.stderr.write(
      `FEHLER: Verifizierung fehlgeschlagen — erwartet ${expectedFloatEvents} FloatEvents, gefunden ${floatEventCount}\n`,
    );

    return 1;
  }

  if (!clipBlock.includes("<ClipEnvelope ")) {
    process.stderr.write(
      "FEHLER: Verifizierung fehlgeschlagen — <ClipEnvelope nicht im Clip gefunden\n",
    );

    return 1;
  }

  process.stdout.write(
    `OK: param=${args.param}, id=${targetId}, breakpoints=${validated.length}, backup=${bakPath}, FloatEvents=${floatEventCount}\n`,
  );

  return 0;
}

/**
 * Validate the --scope/--target flags for the `write` subcommand.
 * @param flags - Parsed flag map
 * @returns Exit code 1 if scope/target invalid, otherwise null
 */
function checkScope(flags: Record<string, string>): number | null {
  const scope = flags.scope ?? "clip";

  if (scope !== "clip" && scope !== "arrangement") {
    process.stderr.write(
      `FEHLER: unbekanntes --scope "${scope}" (clip|arrangement)\n`,
    );

    return 1;
  }

  if (scope === "arrangement") {
    const target = flags.target;

    // "true" = Boolean-Flag ohne Folgewert (parseFlags-Konvention)
    if (target === undefined || target === "true") {
      process.stderr.write(
        "FEHLER: --scope arrangement erfordert --target (mixer:volume|mixer:pan|mixer:send:<n>|device)\n",
      );

      return 1;
    }
  }

  return null;
}

/**
 * Resolve the arrangement automation target into an AlsParam.
 *
 * Returns `null` ONLY when the `--target` *format* is unrecognized
 * (neither `device` nor `mixer:volume|mixer:pan|mixer:send:<n>`); the caller
 * maps this to a "ungültiges --target" exit-1 message. A syntactically valid
 * target whose track/param does not exist does NOT yield `null` — the
 * underlying resolver (`resolveAutomationTargetId`/`resolveMixerTarget`)
 * throws, and that exception propagates up to the `runCli` catch block which
 * converts it into exit 1. This split keeps "bad format" (handled here) and
 * "valid format, not found" (resolver-thrown) on distinct, well-defined paths.
 *
 * @param xml - The .als XML content
 * @param flags - Parsed flag map
 * @param track - Track name
 * @param target - Value of --target
 * @returns Resolved AlsParam, or null if the --target format is invalid
 */
function resolveArrangementTarget(
  xml: string,
  flags: Record<string, string>,
  track: string,
  target: string,
): AlsParam | null {
  if (target === "device") {
    return resolveAutomationTargetId(
      xml,
      track,
      Number(flags.device ?? 0),
      flags.param ?? "",
    );
  }

  if (/^mixer:(volume|pan|send:\d+)$/.test(target)) {
    return resolveMixerTarget(xml, track, target.slice("mixer:".length));
  }

  return null;
}

/**
 * Run the `write` subcommand for scope=arrangement: inject an arrangement
 * automation envelope into a track's AutomationEnvelopes block.
 * @param flags - Parsed flag map
 * @returns Exit code (0 success, 1 error, 2 open-set guard)
 */
function runWriteArrangement(flags: Record<string, string>): number {
  const alsPath = flags.als;
  const track = flags.track;
  const target = flags.target;
  const force = flags.force === "true";

  if (alsPath == null || track == null || flags.breakpoints == null) {
    process.stderr.write(
      "FEHLER: --als, --track und --breakpoints erforderlich\n",
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
  const resolved = resolveArrangementTarget(xml, flags, track, target ?? "");

  if (resolved == null) {
    process.stderr.write(
      `FEHLER: ungültiges --target "${target ?? ""}" (mixer:volume|mixer:pan|mixer:send:<n>|device)\n`,
    );

    return 1;
  }

  // flags.breakpoints ist durch den Guard oben garantiert non-null.
  const bps = parseBreakpoints(flags.breakpoints.replaceAll(",", "\n"));
  const range =
    resolved.min != null && resolved.max != null
      ? { min: resolved.min, max: resolved.max }
      : { min: -Infinity, max: Infinity };
  // Wie der Clip-Pfad: IMMER validieren (unbeschränkter Range als Fallback),
  // nie ungeprüft durchreichen.
  const validated = validateBreakpoints(bps, range);

  backupAls(alsPath);
  const updated = injectArrangementEnvelope(
    xml,
    track,
    resolved.automationTargetId,
    validated,
  );

  // Mitigation B (Ziel-Track-genau): injectArrangementEnvelope ändert NUR
  // innerhalb des Ziel-Track-Blocks. Wir vergleichen daher exakt das Byte-
  // Komplement (alles VOR tStart + alles AB tEnd) von xml und updated. Ein
  // versehentlicher Edit in einem ANDEREN Track-Block würde so erkannt — der
  // alte globale AutomationEnvelopes-STRIP hätte ihn maskiert.
  const { index: tStart, end: tEnd } = locateTrackBlock(xml, track);
  // injectArrangementEnvelope ändert ausschließlich Bytes INNERHALB
  // [tStart, tEnd) — der Block wird nur länger. Die Invariante: Prefix
  // [0, tStart) identisch UND der Suffix AB dem Track-Block-Ende identisch.
  // Im (längeren) updated beginnt dieser Suffix bei tEnd + Längendelta.
  const delta = updated.length - xml.length;

  if (
    xml.slice(0, tStart) !== updated.slice(0, tStart) ||
    xml.slice(tEnd) !== updated.slice(tEnd + delta)
  ) {
    process.stderr.write(
      "FEHLER: unerwartete Änderung außerhalb des Ziel-Track-Blocks\n",
    );

    return 1;
  }

  writeAls(alsPath, updated);

  // Verify auf Clip-Pfad-Niveau: reparsen, Ziel-Track-Block lokalisieren und
  // (a) PointeeId == resolved.automationTargetId UND (b) FloatEvent-Count ==
  // validated.length + 1 (Anchor) im neu erzeugten Track-Envelope prüfen.
  const reparsed = readAls(alsPath);
  const { block: reparsedTrackBlock } = locateTrackBlock(reparsed, track);
  const pointeeCheck = `<PointeeId Value="${resolved.automationTargetId}" />`;
  // Scope auf GENAU den neu erzeugten <AutomationEnvelope>-Block (der mit
  // unserer PointeeId) — analog zum Clip-Pfad, der auf den Clip-Block scoped.
  // Ein roher FloatEvent-Count über den ganzen Track-Block würde fremde
  // (bereits vorhandene) Envelopes mitzählen.
  const envBlocks = [
    ...reparsedTrackBlock.matchAll(
      /<AutomationEnvelope\b[^]*?<\/AutomationEnvelope>/g,
    ),
  ];
  const targetEnv = envBlocks.find((b) => b[0].includes(pointeeCheck))?.[0];
  const hasPointee = targetEnv != null;
  const floatEventCount =
    targetEnv != null ? [...targetEnv.matchAll(/<FloatEvent /g)].length : 0;
  const expectedFloatEvents = validated.length + 1;
  const ok = hasPointee && floatEventCount === expectedFloatEvents;

  if (!ok) {
    process.stderr.write(
      `FEHLER: Verifizierung fehlgeschlagen — PointeeId ${resolved.automationTargetId} ` +
        `${hasPointee ? "gefunden" : "fehlt"}, FloatEvents ${floatEventCount}/${expectedFloatEvents}\n`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      scope: "arrangement",
      target,
      track,
      written: validated.length,
      verified: ok,
    })}\n`,
  );

  return ok ? 0 : 1;
}

/**
 * Run the CLI with the given argument array and return an exit code.
 * Never throws — all errors are caught and returned as exit codes.
 * @param argv - Argument array (without node and script path)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runCli(argv: string[]): number {
  const [subcommand, ...rest] = argv;
  const flags = parseFlags(rest);

  try {
    if (subcommand === "list") return runList(flags);
    if (subcommand === "write") return runWrite(flags);
    if (subcommand === "clip-settings")
      return runClipSettings(rest, parseFlags);
    if (subcommand === "fades") return runFades(rest, parseFlags);
    if (subcommand === "fadeout-curve")
      return runFadeoutCurve(rest, parseFlags);
    if (subcommand === "groove") return runGroove(rest);
    if (subcommand === "tempo") return runTempo(rest);
    if (subcommand === "timesig") return runTimesig(rest);
    if (subcommand === "clip-flags") return runClipFlags(rest);
    if (subcommand === "track-group") return runTrackGroup(rest);
    if (subcommand === "mixer-routing") return runMixerRouting(rest);
    if (subcommand === "modulation") return runModulation(rest);

    process.stderr.write(
      `FEHLER: Unbekanntes Subcommand "${subcommand}". Nutze list oder write.\n`,
    );

    return 1;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    process.stderr.write(`FEHLER: ${msg}\n`);

    return 1;
  }
}

// Run as main only when invoked directly
if (process.argv[1]?.endsWith("ppal-write-automation.ts") === true) {
  process.exit(runCli(process.argv.slice(2)));
}
