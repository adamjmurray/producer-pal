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
import { parseBreakpoints } from "#src/automation/breakpoint-parser.ts";
import { validateBreakpoints } from "#src/automation/breakpoint-validator.ts";
import {
  injectTempoEnvelope,
  locateTempoEnvelopeEvents,
  resolveMasterTempoTargetId,
} from "#src/automation/master-timeline/als-tempo-automation.ts";
import { parseFlags } from "./clip-patch-cli.ts";

/** Shared Open-Set (Port 3350) guard message for the writing subcommands. */
const OPEN_SET_MSG =
  "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n";

/**
 * Run the `tempo list|write` subcommand.
 *
 * list: read-only — print the resolved Master/Main-Track Tempo
 * `AutomationTarget Id` (the Tempo-Envelope PointeeId). No Open-Set guard,
 * no write.
 *
 * write: parse `--breakpoints` (comma-separated `bar=bpm`) via the shared
 * `parseBreakpoints`/`validateBreakpoints`, inject the linear Master-Tempo
 * envelope via `injectTempoEnvelope` (Slice-6b curve/time-signature input is
 * rejected inside the injector), enforce the Open-Set guard (exit 2 without
 * --force), back up + atomically write, then re-parse verify the raw tag
 * count (anchor + N breakpoints). Mirrors the `groove`/`fades` helper shape.
 *
 * @param rest - Argument array (without the `tempo` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runTempo(rest: string[]): number {
  const sub = rest[0];

  if (sub === "list") return runTempoList(rest);
  if (sub === "write") return runTempoWrite(rest);

  process.stderr.write("FEHLER: tempo list|write\n");

  return 1;
}

/**
 * Run `tempo list`: resolve and print the Master-Tempo-AutomationTarget-Id.
 * Read-only — no Open-Set guard, no write.
 * @param rest - Argument array (without the `tempo` token)
 * @returns Exit code: 0 success, 1 error
 */
function runTempoList(rest: string[]): number {
  const flags = parseFlags(rest);
  const alsPath = flags.als;

  if (alsPath == null) {
    process.stderr.write("FEHLER: --als erforderlich\n");

    return 1;
  }

  const xml = readAls(alsPath);
  const tempoId = resolveMasterTempoTargetId(xml);

  process.stdout.write(`${tempoId}\n`);

  return 0;
}

/**
 * Run `tempo write`: inject a linear Master-Tempo envelope.
 *
 * Parses `--breakpoints` (`bar=bpm` comma list) via the shared
 * `parseBreakpoints`/`validateBreakpoints` (unbounded BPM range — Ableton
 * clamps), enforces the Open-Set guard (exit 2 without --force), backs up,
 * atomically writes via `writeAls`, then re-parse-verifies the raw FloatEvent
 * count (anchor + N user breakpoints).
 *
 * @param rest - Argument array (without the `tempo` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
function runTempoWrite(rest: string[]): number {
  const flags = parseFlags(rest);
  const alsPath = flags.als;
  const breakpoints = flags.breakpoints;
  const force = flags.force === "true";

  if (alsPath == null || breakpoints == null) {
    process.stderr.write("FEHLER: --als und --breakpoints erforderlich\n");

    return 1;
  }

  if (isSetLikelyOpen() && !force) {
    process.stderr.write(OPEN_SET_MSG);

    return 2;
  }

  const bps = parseBreakpoints(breakpoints.replaceAll(",", "\n"));
  const validated = validateBreakpoints(bps, {
    min: -Infinity,
    max: Infinity,
  });

  const before = readAls(alsPath);
  const after = injectTempoEnvelope(before, validated);

  backupAls(alsPath);
  writeAls(alsPath, after);

  // Re-parse verify (raw tag check): re-read, re-locate the Tempo-Envelope
  // <Events> block and assert FloatEvent count == anchor + breakpoints.
  const reparsed = readAls(alsPath);
  const { block } = locateTempoEnvelopeEvents(reparsed);
  const floatEventCount = [...block.matchAll(/<FloatEvent /g)].length;
  const expected = validated.length + 1;
  const ok = floatEventCount === expected;

  if (!ok) {
    process.stderr.write(
      `FEHLER: Verifizierung fehlgeschlagen — erwartet ${expected} ` +
        `FloatEvents, gefunden ${floatEventCount}\n`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      als: alsPath,
      written: validated.length,
      floatEvents: floatEventCount,
      verified: ok,
    })}\n`,
  );

  return ok ? 0 : 1;
}
