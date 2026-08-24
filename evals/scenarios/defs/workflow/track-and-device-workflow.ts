// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Create track, add device, update properties, route two sends — one
 * to a return the model just made, one to a return the Set already had.
 */

import { type EvalAssertion, type EvalScenario } from "../../types.ts";

const TOOL_UPDATE_TRACK = "ppal-update-track";

/** Drums is the first track of the basic-midi-4-track Live Set. */
const DRUMS_TRACK_INDEX = 0;
/** The Set's first return track, and the one turn 6 sends to. */
const DELAY_RETURN = "A-Delay";
/** The send level turn 6 asks for, in dB. */
const SEND_DB = -6;
/** Live quantizes a dB write, so compare with slack rather than for equality. */
const DB_TOLERANCE = 0.2;

/** One send off a track's mixer read. */
interface TrackSend {
  return?: string;
  gainDb?: number;
}

/**
 * The Drums track's send to the delay return sits at the asked-for level. Both
 * halves matter: `sendGainDb` without `sendReturn` (or a return name that
 * matches nothing) warns and writes nothing, and the tool still succeeds.
 *
 * @returns A state assertion over the track's sends
 */
function assertDelaySend(): EvalAssertion {
  const sends = (result: unknown) =>
    ((result as { sends?: TrackSend[] }).sends ?? []).filter(
      (send) => send.return === DELAY_RETURN,
    );

  return {
    type: "state",
    tool: "ppal-read-track",
    args: { trackIndex: DRUMS_TRACK_INDEX, include: ["mixer"] },
    expect: (result) =>
      sends(result).some(
        (send) => Math.abs((send.gainDb ?? -70) - SEND_DB) <= DB_TOLERANCE,
      ),
    explain: (result) =>
      `expected the Drums send to ${DELAY_RETURN} at ${SEND_DB} dB, got ${
        sends(result)
          .map((send) => `${send.gainDb ?? "?"} dB`)
          .join(", ") || "no such send"
      }`,
  };
}

export const trackAndDeviceWorkflow: EvalScenario = {
  id: "track-and-device-workflow",
  description:
    "Create track, add device, update properties, route sends to a new and an existing return",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // Both send turns need update-track's `sendGainDb`/`sendReturn`, which
  // small-model mode strips from the schema — a send is impossible there, and
  // the scenario used to score a pass for calling update-track at all.
  requires: { params: ["sendReturn"] },
  // The checks below pin the outcome. The judge only adds commentary they
  // can't anticipate — hallucinations, misleading prose, extra steps.
  judgeAdvisory: true,

  messages: [
    "Connect to Ableton Live",
    "Create a MIDI track called 'Synth Lead'",
    "Add a Wavetable instrument to it",
    "Mute that track and set its color to purple",
    "Set the filter cutoff to 50%",
    "Create a return track with a Reverb on it, then send the Synth Lead track to that return at -12 dB",
    // A return the Set already had, named but not pointed at: the model has to
    // find it before it can name it in the send.
    "The Drums track could use some of that delay — send it to the A-Delay return at -6 dB.",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Track creation
    { type: "tool_called", tool: "ppal-create-track", turn: 1 },

    // Turn 2: Device creation
    { type: "tool_called", tool: "ppal-create-device", turn: 2 },

    // Turn 3: Track property updates
    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: 3 },

    // Verify response mentions the track
    { type: "response_contains", pattern: /synth lead/i, turn: 1 },

    // Verify response mentions Wavetable
    { type: "response_contains", pattern: /wavetable/i, turn: 2 },

    // Verify response mentions mute or purple
    { type: "response_contains", pattern: /mute|purple/i, turn: 3 },

    // Turn 4: Device parameter update
    { type: "tool_called", tool: "ppal-update-device", turn: 4 },
    {
      type: "response_contains",
      pattern: /filter|cutoff/i,
      turn: 4,
    },

    // Turn 5: Return track + send routing
    { type: "tool_called", tool: "ppal-create-track", turn: 5 },
    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: 5 },
    {
      type: "response_contains",
      pattern: /send|return|reverb/i,
      turn: 5,
    },

    // Turn 6: send to a return that already existed
    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: 6 },
    assertDelaySend(),

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a MIDI track named "Synth Lead"
2. Added a Wavetable instrument
3. Muted the track
4. Changed the track color to purple
5. Adjusted the filter cutoff parameter on the device
6. Created a return track (with a Reverb) and set the Synth Lead track's send to that return to -12 dB
7. Set the Drums track's send to the existing A-Delay return to -6 dB`,
    },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 170_000,
    },
  ],
};
