// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: write a curved volume fade-in on the Lead clip.
 *
 * Points join with `/` (straight), `_` (jump) or `~N` (curve: positive bends
 * above the straight line, negative below). "Start slow and speed up" needs a
 * negative `~N`, so the model must pick a curve and get the sign right.
 *
 * Graded on the read-back, where Live prints each stored ramp as `/` or `~N`:
 * a straight ramp or a hand-made staircase fails.
 *
 * Scenario: random pan steps on every sixteenth of the Lead clip.
 *
 * A point can repeat (`1|1x32@n/16`) and roll its value (`rand(-1, 1)`), so the
 * model needn't list 32 points or invent "random" numbers itself.
 *
 * Graded on the read-back: one pan envelope of flat steps a sixteenth apart
 * with varied values. Spelling it as a repeat with rand() is the secondary
 * signal, and the token cap is what a hand-written list would break.
 */

import { type EvalScenario } from "../../../types.ts";
import { MSG_CONNECT, TOOL_CONNECT } from "../helpers/clip-tool-constants.ts";
import {
  assertEnvelopeWriteLanded,
  assertLeadEnvelopes,
  curveAmounts,
  envelopeValues,
  envelopeWrites,
  parameterNames,
  sortEnvelopes,
  TOOL_READ_CLIP,
  TOOL_UPDATE_CLIP,
  FULL_VOLUME_NOTE,
} from "./helpers/clip-envelope-readback.ts";
import { ON_BARE_LEAD_CLIP } from "./helpers/seed-clip-envelopes.ts";

/** How far a curve must bend to count as one, not a rounding of a straight line. */
const MIN_BEND = 0.2;

/** A negative curve in a landed write's own notation (the secondary signal). */
const NEGATIVE_CURVE = /\s~-\d/;

export const automationWriteCurve: EvalScenario = {
  ...ON_BARE_LEAD_CLIP,
  id: "automation-write-curve",
  description:
    "Write a slow-then-fast volume fade-in as a curved ramp on the Lead clip",
  requires: {
    tools: [TOOL_READ_CLIP, TOOL_UPDATE_CLIP],
    params: ["envelopes"],
  },

  messages: [
    MSG_CONNECT,
    "On the Lead clip, fade the volume in from silence to full over the whole clip. I want it to start slow and speed up toward the end, not a straight line. Use clip automation.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertEnvelopeWriteLanded(),

    // One volume envelope, rising from near silence, whose ramp bends below
    // the straight line (slow start) and never above it.
    assertLeadEnvelopes((envelopes) => {
      const { volume } = sortEnvelopes(envelopes);
      const [fade] = volume;

      if (envelopes.length !== 1 || fade == null) {
        return `expected one volume envelope, got ${parameterNames(envelopes)}`;
      }

      const values = envelopeValues(fade.events);
      const curves = curveAmounts(fade.events);
      const problems: string[] = [];

      if ((values[0] ?? 1) > 0.3 || (values.at(-1) ?? 0) < 0.7) {
        problems.push(
          `volume should run from near silence to near full, got ${values.join(" -> ")}`,
        );
      }

      if (!curves.some((amount) => amount <= -MIN_BEND)) {
        problems.push(
          `expected a ramp that bends below the straight line (~-0.2 or lower), the envelope reads: ${fade.events ?? "no events"}`,
        );
      }

      if (curves.some((amount) => amount >= MIN_BEND)) {
        problems.push("a fast start (positive curve) is the wrong way round");
      }

      return problems.length > 0 ? problems.join("; ") : null;
    }),

    // Secondary: the write itself spelled the curve, not a staircase of steps.
    {
      type: "custom",
      description: "the envelopes write used a negative curve (~-N)",
      assert: (turns) =>
        envelopeWrites(turns).some((call) =>
          NEGATIVE_CURVE.test(` ${String(call.args.envelopes)}`),
        ),
    },

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for the Lead clip's volume to fade in from silence to full,
starting slow and speeding up toward the end rather than rising in a straight
line, using clip automation. Evaluate the final reply: it says a volume fade-in
with that slow-then-fast shape was written on the Lead clip.

${FULL_VOLUME_NOTE}`,
    },
  ],
};

/** The Lead clip's two bars of 4/4, in sixteenths. */
const STEPS = 32;

/** Random values this varied aren't a short hand-made cycle. */
const MIN_DISTINCT_VALUES = 8;

/** A repeated point with a rand() value, in a landed write's own notation. */
const REPEAT_WITH_RAND = /\dx\d+@\S+\s+rand(?:om)?\(/;

export const automationWriteRandomSteps: EvalScenario = {
  ...ON_BARE_LEAD_CLIP,
  id: "automation-write-random-steps",
  description:
    "Write random pan steps on every sixteenth of the Lead clip with one repeated rand() point",
  requires: {
    tools: [TOOL_READ_CLIP, TOOL_UPDATE_CLIP],
    params: ["envelopes"],
  },

  messages: [
    MSG_CONNECT,
    "On the Lead clip, make the pan jump to a new random position on every sixteenth note for the whole clip, anywhere from hard left to hard right, holding flat between jumps. Use clip automation.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertEnvelopeWriteLanded(),

    assertLeadEnvelopes((envelopes) => {
      const [steps] = sortEnvelopes(envelopes).pan;

      if (envelopes.length !== 1 || steps == null) {
        return `expected one pan envelope, got ${parameterNames(envelopes)}`;
      }

      // A read shows an envelope's first events only, and a cut can split the
      // last step in two, so the count comes from eventCount and the last
      // point shown is left out.
      const shown = (steps.events ?? "").replaceAll(/\s*\([^()]*\)/g, "");
      const values = envelopeValues(shown).slice(0, -1);
      const stepCount = (steps.eventCount + 1) / 2;
      const problems: string[] = [];

      // Two equal neighbours store one event fewer, so a few can go missing.
      if (stepCount < STEPS - 2 || stepCount > STEPS + 1) {
        problems.push(
          `expected about ${String(STEPS)} flat steps (one per sixteenth), got ${String(steps.eventCount)} events`,
        );
      }

      const connectors = shown
        .split(/\s+/)
        .filter((token) => /^(?:\/|_|~.*)$/.test(token))
        .slice(0, -1);

      if (connectors.some((connector) => connector !== "_")) {
        problems.push("the steps should hold flat (_), but some ramp");
      }

      if (new Set(values).size < MIN_DISTINCT_VALUES) {
        problems.push(
          `expected varied random values, got ${String(new Set(values).size)} distinct`,
        );
      }

      return problems.length > 0 ? problems.join("; ") : null;
    }),

    // Secondary: one repeated point did it, not a hand-written list.
    {
      type: "custom",
      description: "the envelopes write used a repeat with rand()",
      assert: (turns) =>
        envelopeWrites(turns).some((call) =>
          REPEAT_WITH_RAND.test(String(call.args.envelopes)),
        ),
    },

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for the Lead clip's pan to jump to a new random position on
every sixteenth note across the whole clip, holding flat between jumps, using
clip automation. Evaluate the final reply: it says random stepped pan automation
was written on the Lead clip.`,
    },
  ],
};
