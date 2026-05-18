// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertNoTimeSigCurve,
  injectTimeSigEnvelope,
  locateTimeSigEnvelopeEvents,
  resolveTimeSigTargetId,
} from "#src/automation/master-timeline/als-timesig-automation.ts";
import { runMaintrackSubcommand } from "./ppal-maintrack-helpers.ts";

/**
 * Run the `timesig list|write` subcommand (raw-int Master-TimeSignature
 * envelope, Events-Replace). Thin wrapper over the shared MainTrack-automation
 * CLI runner; `assertNoTimeSigCurve` is wired as the per-breakpoint guard so
 * curved input is rejected (Slice 6c) before any mutation.
 * @param rest - Argument array (without the `timesig` token)
 * @returns Exit code: 0 success, 1 error, 2 open-set guard
 */
export function runTimesig(rest: string[]): number {
  return runMaintrackSubcommand(rest, {
    name: "timesig",
    resolveTargetId: resolveTimeSigTargetId,
    locateEvents: locateTimeSigEnvelopeEvents,
    injectEnvelope: injectTimeSigEnvelope,
    eventTag: "EnumEvent",
    perBreakpointGuard: assertNoTimeSigCurve,
  });
}
