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
import {
  type Breakpoint,
  validateBreakpoints,
} from "#src/automation/breakpoint-validator.ts";
import { parseFlags } from "./clip-patch-cli.ts";

/** Shared Open-Set (Port 3350) guard message for the writing subcommands. */
const OPEN_SET_MSG =
  "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n";

/**
 * Per-MainTrack-automation CLI configuration. Captures exactly the parts that
 * differ between the structurally identical `tempo` and `timesig` subcommands
 * (Slice-6 Events-Replace on the same MainTrack envelope schema).
 */
export interface MaintrackCliConfig {
  /** Subcommand name, used in usage/error text (e.g. `tempo`, `timesig`). */
  name: string;
  /** Resolve the MainTrack AutomationTarget Id (= envelope PointeeId). */
  resolveTargetId: (xml: string) => string;
  /** Locate the target envelope `<Events>` block (`block` is asserted on). */
  locateEvents: (xml: string) => { block: string };
  /** Replace the target envelope `<Events>` block with anchor + breakpoints. */
  injectEnvelope: (xml: string, breakpoints: Breakpoint[]) => string;
  /** Event element tag for the re-parse count check (`FloatEvent`/`EnumEvent`). */
  eventTag: string;
  /** Optional per-breakpoint guard run before mutation (e.g. Slice-6c lock). */
  perBreakpointGuard?: (bp: Breakpoint) => void;
}

/**
 * Run a MainTrack-automation `list|write` subcommand for the given config.
 *
 * list: read-only — print the resolved MainTrack AutomationTarget Id. No
 * Open-Set guard, no write.
 *
 * write: parse `--breakpoints` (comma-separated `bar=value`) via the shared
 * `parseBreakpoints`/`validateBreakpoints`, run the optional per-breakpoint
 * guard, enforce the Open-Set guard (exit 2 without --force), back up +
 * atomically write via the config's `injectEnvelope`, then re-parse verify
 * the raw event count (anchor + N breakpoints).
 *
 * @param rest - Argument array (without the subcommand token)
 * @param cfg - The MainTrack-automation CLI configuration
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runMaintrackSubcommand(
  rest: string[],
  cfg: MaintrackCliConfig,
): number {
  const sub = rest[0];

  if (sub === "list") return runMaintrackList(rest, cfg);
  if (sub === "write") return runMaintrackWrite(rest, cfg);

  process.stderr.write(`FEHLER: ${cfg.name} list|write\n`);

  return 1;
}

/**
 * Run the read-only `list`: resolve and print the AutomationTarget Id.
 * @param rest - Argument array (without the subcommand token)
 * @param cfg - The MainTrack-automation CLI configuration
 * @returns Exit code: 0 success, 1 error
 */
function runMaintrackList(rest: string[], cfg: MaintrackCliConfig): number {
  const flags = parseFlags(rest);
  const alsPath = flags.als;

  if (alsPath == null) {
    process.stderr.write("FEHLER: --als erforderlich\n");

    return 1;
  }

  process.stdout.write(`${cfg.resolveTargetId(readAls(alsPath))}\n`);

  return 0;
}

/**
 * Run `write`: inject the MainTrack envelope (Events-Replace) and re-verify.
 * @param rest - Argument array (without the subcommand token)
 * @param cfg - The MainTrack-automation CLI configuration
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
function runMaintrackWrite(rest: string[], cfg: MaintrackCliConfig): number {
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

  const validated = validateBreakpoints(
    parseBreakpoints(breakpoints.replaceAll(",", "\n")),
    { min: -Infinity, max: Infinity },
  );

  if (cfg.perBreakpointGuard != null) {
    for (const bp of validated) cfg.perBreakpointGuard(bp);
  }

  const before = readAls(alsPath);
  const after = cfg.injectEnvelope(before, validated);

  backupAls(alsPath);
  writeAls(alsPath, after);

  // Re-parse verify (raw tag check): re-read, re-locate the envelope
  // <Events> block and assert event count == anchor + breakpoints.
  const { block } = cfg.locateEvents(readAls(alsPath));
  const eventCount = [...block.matchAll(new RegExp(`<${cfg.eventTag} `, "g"))]
    .length;
  const expected = validated.length + 1;
  const ok = eventCount === expected;

  if (!ok) {
    process.stderr.write(
      `FEHLER: Verifizierung fehlgeschlagen — erwartet ${expected} ` +
        `${cfg.eventTag}s, gefunden ${eventCount}\n`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      als: alsPath,
      written: validated.length,
      events: eventCount,
      verified: ok,
    })}\n`,
  );

  return ok ? 0 : 1;
}
