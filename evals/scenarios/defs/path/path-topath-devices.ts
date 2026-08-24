// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: `toPath` for the two non-clip destination kinds — a device slot on
 * another track, and a drum pad in the same rack.
 *
 * The device case deliberately grades the SHAPE (`t1`, or `t1/d<n>`) rather
 * than one index: where in a track's device chain a copy belongs is the model's
 * call, and pinning it would grade that choice instead of the grammar. The drum
 * pad case is exact — `p<note>` names a fixed pad, so there is nothing to choose.
 */

import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-scenario-helpers.ts";
import { assertPathArg } from "./path-scenario-helpers.ts";

const TOOL_DUPLICATE = "ppal-duplicate";

/** Lead carries a Pitch MIDI effect; Bass has none, so the copy is visible. */
const BASS_TRACK_INDEX = 1;
const DRUMS_TRACK_INDEX = 0;

/** Anywhere in the Bass track's device chain, appended or inserted. */
const DEVICE_DESTINATION = /^t1(\/d\d+)?$/;

/**
 * The Cyndal Kit spans C1–Eb2, so C3 is an empty pad. The Drum Rack is nested
 * inside an Instrument Rack, so reaching a pad walks `d` → `c` → `d` → `p` —
 * the deepest segment chain the grammar has, and the model has to discover it.
 */
const PAD_DESTINATION = "t0/d0/c0/d0/pC3";

/**
 * The Pitch MIDI effect landed somewhere on the Bass track.
 * @returns A state assertion over the track's devices
 */
function assertDeviceCopied(): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-track",
    args: { trackIndex: BASS_TRACK_INDEX, include: ["devices"] },
    expect: (result) => deviceTypes(result).some((type) => /Pitch/i.test(type)),
    explain: (result) =>
      `expected a Pitch device on the Bass track, got ${deviceTypes(result).join(", ") || "none"}`,
  };
}

/**
 * Device type strings on the read track.
 * @param result - Parsed ppal-read-track result
 * @returns Each device's type
 */
function deviceTypes(result: unknown): string[] {
  const track = result as { devices?: Array<{ type?: string }> };

  return (track.devices ?? []).map((device) => device.type ?? "?");
}

/**
 * The drum rack now has a pad at C3, where it had none.
 * @returns A state assertion over the rack's drum map
 */
function assertPadCreated(): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-track",
    args: { trackIndex: DRUMS_TRACK_INDEX, include: ["drum-map"] },
    expect: (result) =>
      "C3" in ((result as { drumMap?: Record<string, string> }).drumMap ?? {}),
    explain: (result) =>
      `expected a pad at C3, got pads ${Object.keys(
        (result as { drumMap?: Record<string, string> }).drumMap ?? {},
      ).join(", ")}`,
  };
}

export const pathToPathDeviceAndPad: EvalScenario = {
  id: "path-topath-devices",
  description: "toPath for a device slot and a drum pad destination",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  messages: [
    MSG_CONNECT,
    "Copy the Pitch MIDI effect from the Lead track onto the Bass track.",
    "In the Drums track's drum rack, copy the kick pad onto the empty C3 pad.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 1 },
    assertPathArg({
      turn: 1,
      tool: TOOL_DUPLICATE,
      param: "toPath",
      expected: DEVICE_DESTINATION,
    }),
    assertDeviceCopied(),

    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 2 },
    assertPathArg({
      turn: 2,
      tool: TOOL_DUPLICATE,
      param: "toPath",
      expected: PAD_DESTINATION,
    }),
    assertPadCreated(),

    { type: "token_usage", metric: "inputTokens", maxTokens: 90_000 },
  ],
};
