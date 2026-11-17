// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenarios: automate MIDI controller data on the Lead track, which has no CC
 * Control yet. The model has to add one, then write an
 * envelope in that parameter's own range: 0..127 for the mod wheel, -64..64
 * for pitch bend. A 0..1 ramp is in range for both, so it writes without
 * complaint and plays as a flat line.
 */

import { TOOLS } from "#evals/shared/tool-names.ts";
import { type EvalScenario } from "../../../types.ts";
import { MSG_CONNECT, TOOL_CONNECT } from "../helpers/clip-tool-constants.ts";
import {
  assertEnvelopeWriteLanded,
  assertLeadEnvelopes,
  type ClipEnvelopeRead,
  envelopeValues,
  MIN_RAMP_SHARE,
  parameterNames,
  rampShareOfRise,
  sortEnvelopes,
  TOOL_READ_CLIP,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-envelope-readback.ts";
import { ON_BARE_LEAD_CLIP } from "./helpers/seed-clip-envelopes.ts";

/** A device anywhere on the Lead track, in a rack chain or not. */
const ON_LEAD_TRACK = /^t3\//;

/** How much of a parameter's range the sweep has to cover. */
const MIN_RANGE_SHARE = 0.8;

export const automationCcControlModWheel: EvalScenario = ccControlSweep({
  id: "automation-cc-control-mod-wheel",
  description:
    "Automate the mod wheel on a track with no CC Control, in 0..127",
  message:
    "Automate the mod wheel on the Lead track so it rises from nothing to full over the Lead clip.",
  parameter: /mod wheel/i,
  min: 0,
  max: 127,
  asked: "the mod wheel to rise from nothing to full",
});

export const automationCcControlPitchBend: EvalScenario = ccControlSweep({
  id: "automation-cc-control-pitch-bend",
  description:
    "Automate MIDI pitch bend on a track with no CC Control, in -64..64",
  message:
    "Using MIDI pitch bend, bend the Lead from all the way down to all the way up over the Lead clip.",
  parameter: /pitch bend/i,
  min: -64,
  max: 64,
  asked: "MIDI pitch bend to sweep from all the way down to all the way up",
});

/** What one sweep scenario asks for, and the parameter that answers it. */
interface CcControlSweep {
  id: string;
  description: string;
  message: string;
  /** The CC Control parameter the envelope should be on. */
  parameter: RegExp;
  /** The parameter's envelope range. */
  min: number;
  max: number;
  /** The request in a few words, for the judge. */
  asked: string;
}

/**
 * A scenario that asks for one CC Control parameter to sweep up over the Lead
 * clip.
 * @param sweep - The request and the parameter that answers it
 * @returns The scenario
 */
function ccControlSweep(sweep: CcControlSweep): EvalScenario {
  return {
    ...ON_BARE_LEAD_CLIP,
    id: sweep.id,
    description: sweep.description,
    requires: {
      tools: [TOOL_READ_CLIP, TOOL_UPDATE_CLIP, TOOLS.createDevice],
      params: ["envelopes"],
    },

    messages: [MSG_CONNECT, sweep.message],

    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      assertEnvelopeWriteLanded(),

      assertLeadEnvelopes((envelopes) => {
        const [only] = sortEnvelopes(envelopes).devices;

        if (envelopes.length !== 1 || only == null) {
          return `expected one device envelope, got ${parameterNames(envelopes)}`;
        }

        // Only a CC Control has this parameter, so finding it proves one was added.
        if (
          !sweep.parameter.test(only.parameter) ||
          !ON_LEAD_TRACK.test(only.device ?? "")
        ) {
          return `expected ${sweep.parameter.source} on a Lead device, got ${only.parameter} on ${only.device ?? "?"}`;
        }

        return sweepProblem(only, sweep);
      }),

      { type: "token_usage", maxTokens: 5_000 },

      {
        type: "llm_judge",
        prompt: `The user asked for ${sweep.asked} over the Lead clip. The Lead track had
no CC Control device, which Live needs for this. Evaluate the final reply: it
says the automation was written, and that a CC Control was added to the track.`,
      },
    ],
  };
}

/**
 * Why an envelope isn't the sweep asked for: it has to ramp upward, and cover
 * most of the parameter's range.
 * @param envelope - The envelope the clip reports
 * @param range - The parameter's range
 * @param range.min - Its lowest value
 * @param range.max - Its highest value
 * @returns What's wrong, or null when it sweeps the range
 */
function sweepProblem(
  envelope: ClipEnvelopeRead,
  { min, max }: { min: number; max: number },
): string | null {
  const values = envelopeValues(envelope.events);
  const rise = (values.at(-1) ?? 0) - (values[0] ?? 0);
  const reads = `it reads ${envelope.events ?? "no events"}`;

  if (values.length < 2 || rise <= 0) {
    return `the envelope should rise: ${reads}`;
  }

  if (rampShareOfRise(envelope) < MIN_RAMP_SHARE) {
    return `the envelope should ramp (/ or ~N), not jump (_): ${reads}`;
  }

  return rise >= (max - min) * MIN_RANGE_SHARE
    ? null
    : `the envelope should sweep most of ${min}..${max}: ${reads}`;
}
