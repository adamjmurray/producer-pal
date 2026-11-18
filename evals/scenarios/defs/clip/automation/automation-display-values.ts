// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenarios: automation asked for in the units Live shows, not raw values.
 *
 *   - mixer: volume and a send, each between two dB values.
 *   - device parameter: the Utility's Gain between two dB values, which the
 *     model can name by device path and name or look up by id.
 *
 * The read-back checks what Live displays at each end, so a raw value that was
 * only a guess fails: dB isn't linear in the raw value.
 */

import { type EvalScenario } from "../../../types.ts";
import { MSG_CONNECT, TOOL_CONNECT } from "../helpers/clip-tool-constants.ts";
import {
  assertEnvelopeWriteLanded,
  assertLeadEnvelopes,
  type ClipEnvelopeRead,
  parameterNames,
  sortEnvelopes,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-envelope-readback.ts";
import { ON_BARE_LEAD_CLIP } from "./helpers/seed-clip-envelopes.ts";

/** How far a displayed end may sit from the one asked for, in dB. */
const DB_TOLERANCE = 0.6;

/** A device on the Lead track; the parameter name picks out the Utility. */
const LEAD_DEVICE_PATH = /^t3\/d\d+$/;

/** The Utility's gain, which Live 12 names "Output". */
const UTILITY_GAIN = /gain|output/i;

export const automationDisplayValuesMixer: EvalScenario = {
  ...ON_BARE_LEAD_CLIP,
  id: "automation-display-values-mixer",
  description: "Automate volume and a send on the Lead clip between dB values",
  requires: {
    tools: [TOOL_UPDATE_CLIP],
    params: ["envelopes"],
  },

  messages: [
    MSG_CONNECT,
    "On the Lead clip, ramp the volume from -24 dB up to -6 dB, and send A from -30 dB up to -12 dB. Use clip automation.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertEnvelopeWriteLanded(),

    assertLeadEnvelopes((envelopes) => {
      const { volume, sends } = sortEnvelopes(envelopes);
      const problems = [
        envelopes.length === 2
          ? null
          : `expected exactly volume and one send, got ${parameterNames(envelopes)}`,
        endsProblem("volume", volume, -24, -6),
        endsProblem("send A", sends, -30, -12),
      ].filter((problem) => problem != null);

      return problems.length > 0 ? problems.join("; ") : null;
    }),

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for two automation envelopes on the Lead clip: volume
ramping from -24 dB to -6 dB, and send A from -30 dB to -12 dB. Evaluate the
final reply: it says both were written, with those dB values.`,
    },
  ],
};

export const automationDisplayValuesDeviceParam: EvalScenario = {
  ...ON_BARE_LEAD_CLIP,
  id: "automation-display-values-device-param",
  description: "Automate a device parameter on the Lead clip between dB values",
  requires: {
    tools: [TOOL_UPDATE_CLIP],
    params: ["envelopes"],
  },

  messages: [
    MSG_CONNECT,
    "Make the Utility's Gain on the Lead track rise from -12 dB to 0 dB over the Lead clip, using clip automation.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertEnvelopeWriteLanded(),

    assertLeadEnvelopes((envelopes) => {
      const { devices } = sortEnvelopes(envelopes);
      const [gain] = devices;

      if (envelopes.length !== 1 || gain == null) {
        return `expected one device envelope, got ${parameterNames(envelopes)}`;
      }

      if (
        !LEAD_DEVICE_PATH.test(gain.device ?? "") ||
        !UTILITY_GAIN.test(gain.parameter)
      ) {
        return `expected a Gain on a Lead device, got ${gain.parameter} on ${gain.device ?? "?"}`;
      }

      return endsProblem("Gain", devices, -12, 0);
    }),

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for the Utility's Gain on the Lead track to rise from
-12 dB to 0 dB over the Lead clip, using clip automation. Evaluate the final
reply: it says the Gain automation was written, with those dB values.`,
    },
  ],
};

/**
 * What Live displays at each point of an envelope, as numbers. A point whose
 * display matches its raw value carries none, so the raw value stands in.
 * @param events - An envelope's `events` notation
 * @returns One displayed number per point (NaN when it shows no number)
 */
export function displayedValues(events: string | undefined): number[] {
  return [...(events ?? "").matchAll(/\|\S+\s+(\S+)(?:\s*\(([^()]*)\))?/g)].map(
    ([, raw, display]) => Number.parseFloat(display ?? (raw as string)),
  );
}

/**
 * Check that a kind has one envelope whose ends display the values asked for.
 * @param name - What to call the parameter
 * @param found - The envelopes of that kind
 * @param start - The display asked for at the first point, in dB
 * @param end - The display asked for at the last point, in dB
 * @returns What's wrong, or null when both ends are right
 */
function endsProblem(
  name: string,
  found: ClipEnvelopeRead[],
  start: number,
  end: number,
): string | null {
  const [only] = found;

  if (found.length !== 1 || only == null) {
    return `expected one ${name} envelope, got ${found.length}`;
  }

  const shown = displayedValues(only.events);
  const first = shown[0] ?? Number.NaN;
  const last = shown.at(-1) ?? Number.NaN;

  return Math.abs(first - start) <= DB_TOLERANCE &&
    Math.abs(last - end) <= DB_TOLERANCE
    ? null
    : `${name} should run from ${start} dB to ${end} dB, but it reads ${only.events ?? "no events"}`;
}
