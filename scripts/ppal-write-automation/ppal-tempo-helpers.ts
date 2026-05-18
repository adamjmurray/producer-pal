// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  injectTempoEnvelope,
  locateTempoEnvelopeEvents,
  resolveMasterTempoTargetId,
} from "#src/automation/master-timeline/als-tempo-automation.ts";
import { runMaintrackSubcommand } from "./ppal-maintrack-helpers.ts";

/**
 * Run the `tempo list|write` subcommand (linear Master-Tempo envelope,
 * Events-Replace). Thin wrapper over the shared MainTrack-automation CLI
 * runner; the Slice-6b curve/time-signature lock lives inside
 * `injectTempoEnvelope`, so no per-breakpoint guard is configured here.
 * @param rest - Argument array (without the `tempo` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runTempo(rest: string[]): number {
  return runMaintrackSubcommand(rest, {
    name: "tempo",
    resolveTargetId: resolveMasterTempoTargetId,
    locateEvents: locateTempoEnvelopeEvents,
    injectEnvelope: injectTempoEnvelope,
    eventTag: "FloatEvent",
  });
}
