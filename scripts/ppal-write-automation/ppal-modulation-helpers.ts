// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertOnlyEnvelopeChanged,
  backupAls,
  isSetLikelyOpen,
  readAls,
  writeAls,
} from "#src/automation/als-file.ts";
import {
  getModulationEnvelopes,
  injectModulationEnvelope,
  resolveModulationTargetId,
} from "#src/automation/als-modulation-writer.ts";
import { parseBreakpoints } from "#src/automation/breakpoint-parser.ts";
import { parseFlags } from "./clip-patch-cli.ts";

/**
 * Run the `modulation write|get` subcommand (offline byte-true
 * Modulation-Huellkurve auf einen Device-Param eines Clips).
 * Lean Pfad analog `runWrite`/Mixer-Routing: resolve ModulationTarget-Id →
 * validate (bipolar, im Writer) → inject → backup → write → re-parse verify.
 * Open-Set-Guard (exit 2 ohne `--force`).
 * @param rest - Argument-Array ohne das `modulation`-Token.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runModulation(rest: string[]): number {
  const sub = rest[0];

  if (sub !== "write" && sub !== "get") {
    process.stderr.write("FEHLER: modulation write|get\n");

    return 1;
  }

  const flags = parseFlags(rest);
  const alsPath = flags.als;
  const clip = flags.clip;
  const force = flags.force === "true";

  if (alsPath == null || clip == null) {
    process.stderr.write("FEHLER: --als und --clip erforderlich\n");

    return 1;
  }

  try {
    if (sub === "get") {
      const env = getModulationEnvelopes(readAls(alsPath), clip);

      process.stdout.write(JSON.stringify(env) + "\n");

      return 0;
    }

    return applyModulationWrite(alsPath, clip, flags, force);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    process.stderr.write(`FEHLER: ${msg}\n`);

    return 1;
  }
}

/**
 * Modulation-Huellkurve schreiben + re-parse-verifizieren.
 * @param alsPath - Pfad zur `.als`-Datei.
 * @param clip - Clip-Anzeigename.
 * @param flags - Geparste CLI-Flags.
 * @param force - Open-Set-Guard ueberspringen.
 * @returns Exit-Code 0/1/2.
 */
function applyModulationWrite(
  alsPath: string,
  clip: string,
  flags: Record<string, string>,
  force: boolean,
): number {
  const track = flags.track;
  const deviceIndex = flags["device-index"];
  const param = flags.param;
  const bps = flags.breakpoints;

  if (track == null || deviceIndex == null || param == null || bps == null) {
    process.stderr.write(
      "FEHLER: write erfordert --track --device-index --param --breakpoints\n",
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
  const modId = resolveModulationTargetId(
    xml,
    track,
    Number(deviceIndex),
    param,
  );
  const breakpoints = parseBreakpoints(bps.replaceAll(",", "\n"));
  const updated = injectModulationEnvelope(xml, clip, modId, breakpoints);

  // Byte-Safety (R2, Slice-1-Parität): nur der Envelope-Knoten des Clips
  // darf sich geändert haben.
  assertOnlyEnvelopeChanged(xml, updated, clip);

  backupAls(alsPath);
  writeAls(alsPath, updated);

  const env = getModulationEnvelopes(readAls(alsPath), clip);

  if (!env.some((e) => e.pointeeId === modId)) {
    process.stderr.write("FEHLER: Re-Parse-Verify fehlgeschlagen\n");

    return 1;
  }

  return 0;
}
