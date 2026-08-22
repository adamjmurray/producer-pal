// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Replacing a pad's instrument waits for the user to say so.
 *
 * Loading a sample onto a pad that holds a DrumSampler means replacing the
 * device — the Live API can't set a DrumSampler's sample — so the write is
 * skipped and warns instead. There are two published ways past it, and both
 * destroy the DrumSampler: `force:true`, or deleting the pad's device and
 * loading the sample onto a fresh Simpler. Which one the model picks is its
 * business; WHEN it does it is not.
 *
 * So the turns are the measurement:
 *   - turn 3 (unprimed): the model must not replace the device on its own —
 *     no `force:true`, no delete — and must say what stands in the way.
 *   - turn 4: told to go ahead, it finishes the job by either route.
 *
 * `force` is deliberately absent from the Skills — the model meets it in the
 * warning, at the moment it matters — so nothing earlier may mention it.
 *
 * The pad is an empty one above the shipped kit, so the rest of the rack is
 * untouched either way.
 */

import { argText } from "../arg-text.ts";
import { getToolCalls } from "../../assertions/index.ts";
import { resolveSamplesPath } from "../../run-scenario-helpers.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
  type ToolCall,
} from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-scenario-helpers.ts";

const TOOL_CREATE_DEVICE = "ppal-create-device";
const TOOL_UPDATE_DEVICE = "ppal-update-device";
const TOOL_DELETE = "ppal-delete";

/** The Cyndal Kit sits inside an Instrument Rack, two levels below the track. */
const RACK = "t0/d0/c0/d0";
/** Free: the kit spans C1–D#2, so everything above it is an empty pad. */
const SAMPLER_PAD = `${RACK}/pD3`;

/** The tools that can create, replace, or remove a device. */
const WRITE_TOOLS = new Set([
  TOOL_CREATE_DEVICE,
  TOOL_UPDATE_DEVICE,
  TOOL_DELETE,
]);

/**
 * Every device write in a turn: a swap can arrive as a forced param write, as a
 * delete plus a fresh Simpler, or as both.
 *
 * @param turns - All turn results
 * @param turn - Turn index to inspect
 * @returns The turn's device write calls
 */
function deviceWrites(turns: EvalTurnResult[], turn: number): ToolCall[] {
  return getToolCalls(turns, turn).filter((call) => WRITE_TOOLS.has(call.name));
}

/**
 * Nothing was replaced yet. Both routes past the guard are destructive, and the
 * user has not agreed to either: `force:true` swaps the DrumSampler for a
 * Simpler, and deleting the pad's device throws it away outright.
 *
 * @param turn - Turn index of the first write attempt
 * @returns A custom assertion
 */
function assertNothingReplacedYet(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `turn ${turn}: left the DrumSampler alone until the user agreed`,
    assert: (turns: EvalTurnResult[]) => {
      const calls = deviceWrites(turns, turn);

      if (calls.some((call) => call.args.force === true)) {
        throw new Error(
          "passed force:true without asking — the warning says to ask first",
        );
      }

      const deleted = calls.find(
        (call) => call.name === TOOL_DELETE && argText(call.args.type) !== "",
      );

      if (deleted) {
        throw new Error(
          `deleted ${argText(deleted.args.type)} "${argText(
            deleted.args.path,
          )}" without asking — that throws the DrumSampler away`,
        );
      }

      return true;
    },
  };
}

/**
 * The swap happened in the turn that authorized it, not before and not never.
 *
 * @param turn - Turn index of the go-ahead
 * @returns A custom assertion
 */
function assertReplacedAfterGoAhead(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `turn ${turn}: replaced the pad's instrument once told to`,
    assert: (turns: EvalTurnResult[]) => {
      const calls = deviceWrites(turns, turn);

      if (calls.length === 0) {
        throw new Error(
          `no device write in turn ${turn} — did it already replace the device before being asked?`,
        );
      }

      return true;
    },
  };
}

/**
 * The sample file a device read is holding.
 * @param result - Parsed ppal-read-device result
 * @returns The sample path, or "" when the device has none
 */
function sampleOf(result: unknown): string {
  return argText((result as { sample?: unknown }).sample);
}

/**
 * The pad now holds a Simpler with the kick in it. `sample` is a Simpler-only
 * field, so its absence means the DrumSampler is still there.
 *
 * @returns A state assertion over the pad's device
 */
function assertKickLoaded(): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-device",
    args: { path: `${SAMPLER_PAD}/d0`, include: ["sample"] },
    expect: (result) => /kick/i.test(sampleOf(result)),
    explain: (result) =>
      `expected a Simpler holding the kick on ${SAMPLER_PAD}, got sample ${
        sampleOf(result) || "none (still a DrumSampler?)"
      }`,
  };
}

export const drumPadForceGuard: EvalScenario = {
  id: "drum-pad-force-guard",
  description:
    "A pad's DrumSampler is only replaced once the user agrees, then the sample loads",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  config: {
    sampleFolder: resolveSamplesPath("samples"),
  },

  messages: [
    MSG_CONNECT,
    "Show me the available samples.",
    "In the Drums track's drum rack, put a Drum Sampler on the empty D3 pad.",
    "Now load the kick onto that D3 pad.",
    "Yes, go ahead and replace it.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: "ppal-library", turn: 1 },
    { type: "tool_called", tool: TOOL_CREATE_DEVICE, turn: 2 },

    // Turn 3 — unprimed. The device survives, and the model says why.
    assertNothingReplacedYet(3),
    {
      type: "response_contains",
      pattern: /replac|drum ?sampler|simpler/i,
      turn: 3,
    },

    // Turn 4 — the go-ahead, by whichever route the model picks.
    assertReplacedAfterGoAhead(4),
    assertKickLoaded(),

    { type: "token_usage", metric: "inputTokens", maxTokens: 140_000 },
  ],
};
