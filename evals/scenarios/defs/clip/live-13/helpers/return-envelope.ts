// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Grading the envelope clip on the Live 13 test Set's B-Wide Hallway return
 * (rt1/s0), after the user asks for its Predelay to rise across the bar.
 */

import { argText } from "../../../arg-text.ts";
import {
  envelopesOf,
  envelopeTimes,
  MIN_RAMP_SHARE,
  parameterNames,
  rampShareOfRise,
  risesOverTime,
} from "../../automation/helpers/clip-envelope-readback.ts";
import { getAllToolCalls } from "../../../../assertions/index.ts";
import { type EvalTurnResult } from "../../../../types.ts";
import { noteWrites } from "./stray-writes.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/** The return track's reverb, which owns the Predelay. */
const REVERB_PATH = "rt1/d0";

/** The envelope's last point may sit anywhere from this beat of bar 1 on. */
const LAST_BEAT = 4;

/**
 * What is wrong with the return clip's envelopes: it should still be an
 * envelope clip with exactly one envelope, a Predelay that starts on the first
 * beat, ramps up and ends on the last beat of the bar or at the bar line.
 *
 * @param result - Parsed ppal-read-clip result, read with envelopes
 * @returns A description of what is wrong, or null when it is as asked
 */
export function returnEnvelopeProblem(result: unknown): string | null {
  const clip = result as { type?: string };
  const envelopes = envelopesOf(result);
  const [only] = envelopes;

  if (clip.type !== "envelope") {
    return `clip reads as type ${clip.type ?? "?"}, wanted envelope`;
  }

  if (envelopes.length !== 1 || only == null) {
    return `expected one envelope, got ${parameterNames(envelopes)}`;
  }

  if (!/predelay/i.test(only.parameter) || only.device !== REVERB_PATH) {
    return `expected Predelay on ${REVERB_PATH}, got ${only.parameter} on ${only.device ?? "?"}`;
  }

  const times = envelopeTimes(only.events);

  if (times[0] !== "1|1") {
    return `first point should be at 1|1, it is at ${times[0] ?? "nothing"}`;
  }

  if (!reachesLastBeat(times.at(-1))) {
    return `last point should be on beat ${LAST_BEAT} or later, it is at ${times.at(-1) ?? "nothing"}`;
  }

  if (!risesOverTime(only)) {
    return "Predelay should rise over the bar";
  }

  return rampShareOfRise(only) >= MIN_RAMP_SHARE
    ? null
    : `Predelay should rise with a ramp, not jump: it reads ${only.events ?? "no events"}`;
}

/**
 * Whether a point's time is beat 4 of bar 1 or later.
 *
 * @param time - A point's time, e.g. "2|1"
 * @returns True when it is at or past the last beat of the bar
 */
function reachesLastBeat(time: string | undefined): boolean {
  const match = /^(\d+)\|(\d+)/.exec(time ?? "");

  if (match == null) {
    return false;
  }

  return Number(match[1]) > 1 || Number(match[2]) >= LAST_BEAT;
}

/**
 * What a run did to the return clips that it should not have: created a clip
 * on a return track (an envelope clip can't be made), or written notes.
 *
 * @param turns - All conversation turns
 * @returns One line per offending call, empty when there are none
 */
export function returnClipMisuse(turns: EvalTurnResult[]): string[] {
  const creates = getAllToolCalls(turns)
    .filter(
      (call) =>
        call.name === TOOLS.createClip &&
        /\brt\d/.test(argText(call.args.path)),
    )
    .map((call) => `create-clip on ${argText(call.args.path)}`);
  const notes = noteWrites(turns).map(
    (call) => `${call.name} sent notes to ${argText(call.args.path)}`,
  );

  return [...creates, ...notes];
}
