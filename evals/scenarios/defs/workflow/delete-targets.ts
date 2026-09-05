// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: delete a device, a scene and a drum pad from plain language.
 *
 * `ppal-delete` takes a required `type`, so a misread request deletes the wrong
 * KIND of object, not just the wrong one. Each turn grades that `type` as well
 * as the outcome.
 */

import { getToolCalls } from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";

const TOOL_DELETE = "ppal-delete";

/** Drums is the first track of the basic-midi-4-track Live Set. */
const DRUMS_TRACK_INDEX = 0;
/** The Set ships with 8 scenes; turn 2 removes one. */
const SCENES_AFTER_DELETE = 7;
/** The kit is nested: the Drums instrument rack wraps the drum rack. */
const DRUM_RACK_PATH = "t0/d0/c0/d0";
/** The C2 pad's full name in that kit. */
const SHAKER_PAD = /shaker/i;

/**
 * The delete call in a turn asked for the right kind of object.
 *
 * @param turn - Turn index the delete belongs to
 * @param type - The `type` value the request calls for
 * @returns A custom assertion over that turn's delete calls
 */
function assertDeleteType(turn: number, type: string): EvalAssertion {
  return {
    type: "custom",
    description: `turn ${turn} deletes with type "${type}"`,
    assert: (turns: EvalTurnResult[]) => {
      const calls = getToolCalls(turns, turn).filter(
        (call) => call.name === TOOL_DELETE,
      );

      if (calls.length === 0) throw new Error(`no ${TOOL_DELETE} call`);

      const types = calls.map((call) => String(call.args.type));

      if (!types.includes(type)) {
        throw new Error(`expected type "${type}", got ${types.join(", ")}`);
      }

      return true;
    },
  };
}

/** A track read with its devices. */
interface TrackDevices {
  devices?: Array<{ name?: string; type?: string }>;
}

/** A drum rack read with its pads. */
interface RackPads {
  drumPads?: Array<{ name?: string; pitch?: string }>;
}

/** A Live Set read with its scenes. */
interface SetScenes {
  scenes?: unknown[];
}

/**
 * Every device name on the Drums track, for matching and for failure text.
 *
 * @param result - The parsed read-track result
 * @returns Device names, in chain order
 */
function deviceNames(result: unknown): string[] {
  return ((result as TrackDevices).devices ?? []).map(
    (device) => device.name ?? device.type ?? "?",
  );
}

/**
 * Every pad name on the drum rack, for matching and for failure text.
 *
 * @param result - The parsed read-device result
 * @returns Pad names, in pitch order
 */
function padNames(result: unknown): string[] {
  return ((result as RackPads).drumPads ?? []).map(
    (pad) => pad.name ?? pad.pitch ?? "?",
  );
}

export const deleteTargets: EvalScenario = {
  id: "delete-targets",
  description: "Delete a device, a scene and a drum pad from plain language",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The checks below pin the outcome; the judge only adds commentary.
  judgeAdvisory: true,

  messages: [
    "Connect to Ableton Live",
    "Remove the Utility device from the Drums track",
    "Delete the last scene",
    "The kit on the Drums track has a Shaker pad. Delete it.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: a device
    { type: "tool_called", tool: TOOL_DELETE, turn: 1 },
    assertDeleteType(1, "device"),
    {
      type: "state",
      tool: "ppal-read-track",
      args: { trackIndex: DRUMS_TRACK_INDEX, include: ["devices"] },
      expect: (result) =>
        !deviceNames(result).some((name) => /utility/i.test(name)),
      explain: (result) =>
        `expected Utility gone from Drums, devices are: ${deviceNames(result).join(", ")}`,
    },

    // Turn 2: a scene
    { type: "tool_called", tool: TOOL_DELETE, turn: 2 },
    assertDeleteType(2, "scene"),
    {
      type: "state",
      tool: "ppal-read-live-set",
      args: { include: ["scenes"] },
      expect: (result) =>
        ((result as SetScenes).scenes ?? []).length === SCENES_AFTER_DELETE,
      explain: (result) =>
        `expected ${SCENES_AFTER_DELETE} scenes left, got ${((result as SetScenes).scenes ?? []).length}`,
    },

    // Turn 3: a drum pad. The nearest wrong answer here deletes the whole rack.
    { type: "tool_called", tool: TOOL_DELETE, turn: 3 },
    assertDeleteType(3, "drum-pad"),
    {
      type: "state",
      tool: "ppal-read-device",
      args: { path: DRUM_RACK_PATH, include: ["drum-pads"] },
      expect: (result) => {
        const pads = padNames(result);

        // The rack itself survived, and only the Shaker pad went.
        return pads.length > 0 && !pads.some((name) => SHAKER_PAD.test(name));
      },
      explain: (result) =>
        `expected the kit intact without a Shaker pad, pads are: ${padNames(result).join(", ") || "none — the rack is gone"}`,
    },

    { type: "response_contains", pattern: /utility/i, turn: 1 },
    { type: "response_contains", pattern: /scene/i, turn: 2 },
    { type: "response_contains", pattern: /shaker|pad/i, turn: 3 },

    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Deleted the Utility device from the Drums track, leaving its other devices alone
2. Deleted the last scene
3. Deleted the Shaker pad from the drum kit, leaving the rest of the kit alone
4. Did not delete anything it was not asked to`,
    },
  ],
};
