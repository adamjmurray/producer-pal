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
  assertNoTimeSigCurve,
  injectTimeSigEnvelope,
  locateTimeSigEnvelopeEvents,
  resolveTimeSigTargetId,
} from "#src/automation/master-timeline/als-timesig-automation.ts";
import { parseFlags } from "./clip-patch-cli.ts";

/** Shared Open-Set (Port 3350) guard message for the writing subcommands. */
const OPEN_SET_MSG =
  "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n";

/**
 * Run the `timesig list|write` subcommand.
 *
 * list: read-only — print the resolved Master/Main-Track TimeSignature
 * `AutomationTarget Id` (the Tsig-Envelope PointeeId). No Open-Set guard,
 * no write.
 *
 * write: parse `--breakpoints` (comma-separated `bar=int`) via the shared
 * `parseBreakpoints`/`validateBreakpoints`, inject the raw-int Master-Tsig
 * envelope via `injectTimeSigEnvelope` (Slice-6c curve input is rejected per
 * breakpoint), enforce the Open-Set guard (exit 2 without --force), back up +
 * atomically write, then re-parse verify the raw tag count (anchor + N
 * breakpoints). Mirrors the `tempo` helper shape.
 *
 * @param rest - Argument array (without the `timesig` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runTimesig(rest: string[]): number {
  const sub = rest[0];

  if (sub === "list") return runTimesigList(rest);
  if (sub === "write") return runTimesigWrite(rest);

  process.stderr.write("FEHLER: timesig list|write\n");

  return 1;
}

/**
 * Run `timesig list`: resolve and print the Master-Tsig-AutomationTarget-Id.
 * Read-only — no Open-Set guard, no write.
 * @param rest - Argument array (without the `timesig` token)
 * @returns Exit code: 0 success, 1 error
 */
function runTimesigList(rest: string[]): number {
  const flags = parseFlags(rest);
  const alsPath = flags.als;

  if (alsPath == null) {
    process.stderr.write("FEHLER: --als erforderlich\n");

    return 1;
  }

  const xml = readAls(alsPath);
  const tsigId = resolveTimeSigTargetId(xml);

  process.stdout.write(`${tsigId}\n`);

  return 0;
}

/**
 * Run `timesig write`: inject a raw-int Master-TimeSignature envelope.
 *
 * Parses `--breakpoints` (`bar=int` comma list) via the shared
 * `parseBreakpoints`/`validateBreakpoints` (unbounded range — the EnumEvent
 * value is the raw Ableton time-signature integer), rejects curved input per
 * breakpoint via `assertNoTimeSigCurve`, enforces the Open-Set guard (exit 2
 * without --force), backs up, atomically writes via `writeAls`, then
 * re-parse-verifies the raw EnumEvent count (anchor + N user breakpoints).
 *
 * @param rest - Argument array (without the `timesig` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
function runTimesigWrite(rest: string[]): number {
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

  for (const bp of validated) assertNoTimeSigCurve(bp);

  const before = readAls(alsPath);
  const after = injectTimeSigEnvelope(before, validated);

  backupAls(alsPath);
  writeAls(alsPath, after);

  // Re-parse verify (raw tag check): re-read, re-locate the Tsig-Envelope
  // <Events> block and assert EnumEvent count == anchor + breakpoints.
  const reparsed = readAls(alsPath);
  const { block } = locateTimeSigEnvelopeEvents(reparsed);
  const enumEventCount = [...block.matchAll(/<EnumEvent /g)].length;
  const expected = validated.length + 1;
  const ok = enumEventCount === expected;

  if (!ok) {
    process.stderr.write(
      `FEHLER: Verifizierung fehlgeschlagen — erwartet ${expected} ` +
        `EnumEvents, gefunden ${enumEventCount}\n`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      als: alsPath,
      written: validated.length,
      enumEvents: enumEventCount,
      verified: ok,
    })}\n`,
  );

  return ok ? 0 : 1;
}
