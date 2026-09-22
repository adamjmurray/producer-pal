// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Per-target values: one typed value for one target, and one value per target.
 *
 * Every boolean, number and enum param that pairs with targets now reaches the
 * JSON Schema as `type: string`, so "-3,-8,-12" is a legal value and no client
 * rejects it up front. These two guard both ends of that: a lone typed value
 * still lands, and three values across three named tracks land on the right
 * tracks.
 *
 * `monitoringState` is hidden from small-model mode, so a scenario naming it in
 * `requires` skips there entirely. Only `paired-values-single` asks for it;
 * `paired-values-multi` sticks to gain and mute/solo so small models are still
 * graded on the list form, which is worth more than a third param family in one
 * scenario. The cost: no scenario here grades an enum LIST with differing
 * values.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getToolCalls } from "../../assertions/index.ts";
import { listEntries } from "../path/path-assertions.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_READ_CLIP,
  TOOL_UPDATE_CLIP,
} from "../clip/helpers/clip-tool-constants.ts";
import { clearClipSlots } from "../clip/helpers/clip-turn-readers.ts";

const TOOL_UPDATE_TRACK = "ppal-update-track";
const TOOL_UPDATE_SCENE = "ppal-update-scene";
const TOOL_READ_TRACK = "ppal-read-track";
const TOOL_READ_SCENE = "ppal-read-scene";

/** Tracks of the basic-midi-4-track Live Set these scenarios touch. */
const DRUMS = "t0";
const BASS = "t1";
const CHORDS = "t2";
const LEAD = "t3";

/** The Lead clip slot the single-value scenario seeds, both spellings. */
const LEAD_SLOT = "3/0";
const LEAD_SLOT_PATH = "t3/s0";
/** The user's "scene 2". */
const SCENE_2 = "s1";

/** Live quantizes a dB write, so compare with slack rather than for equality. */
const DB_TOLERANCE = 0.2;

/** Gains the multi-target turn asks for — none is the track's starting value. */
const DRUMS_DB = -3;
const BASS_DB = -8;
const CHORDS_DB = -12;

/** Scene tempo the single-value scenario asks for. */
const SCENE_TEMPO = 90;

/**
 * Muted, with a soloed track elsewhere in the Set or without one. A track this
 * reports as plain `muted-via-solo` was never muted by the model.
 */
const MUTED = ["muted", "muted-also-via-solo"];

/** The track fields these scenarios read back. Defaults are omitted. */
interface TrackRead {
  gainDb?: number;
  isArmed?: boolean;
  monitoringState?: string;
  state?: string;
}

/**
 * A track, read back after the turns.
 *
 * @param path - Track to read
 * @param include - Read detail the check needs
 * @param expect - Matcher over the track read
 * @param explain - Diagnostic for a failed match
 * @returns A state assertion over the track
 */
function assertTrack(
  path: string,
  include: string[],
  expect: (track: TrackRead) => boolean,
  explain: (track: TrackRead) => string,
): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_TRACK,
    args: { path, include },
    expect: (result) => expect(result as TrackRead),
    explain: (result) => explain(result as TrackRead),
  };
}

/**
 * A track's gain, within Live's quantization.
 *
 * @param path - Track to read
 * @param db - Gain the turn asked for
 * @returns A state assertion over the track's mixer
 */
function assertGain(path: string, db: number): EvalAssertion {
  return assertTrack(
    path,
    ["mixer"],
    (track) => Math.abs((track.gainDb ?? 0) - db) <= DB_TOLERANCE,
    (track) => `expected ${path} at ${db} dB, got ${track.gainDb ?? 0}`,
  );
}

/**
 * A track's input monitoring.
 *
 * @param path - Track to read
 * @param expected - Monitoring state the turn asked for
 * @returns A state assertion over the track's routings
 */
function assertMonitoring(path: string, expected: string): EvalAssertion {
  return assertTrack(
    path,
    ["routings"],
    (track) => track.monitoringState === expected,
    (track) =>
      `expected ${path} monitoring ${expected}, got ${track.monitoringState ?? "none"}`,
  );
}

/**
 * A track is record armed.
 *
 * @param path - Track to read
 * @returns A state assertion over the track
 */
function assertArmed(path: string): EvalAssertion {
  return assertTrack(
    path,
    [],
    (track) => track.isArmed === true,
    (track) => `expected ${path} armed, got ${String(track.isArmed ?? false)}`,
  );
}

/**
 * A track's mute/solo state is one of the states the turn could leave it in.
 *
 * @param path - Track to read
 * @param allowed - Acceptable state strings
 * @returns A state assertion over the track
 */
function assertTrackState(path: string, allowed: string[]): EvalAssertion {
  return assertTrack(
    path,
    [],
    (track) => allowed.includes(track.state ?? "active"),
    (track) =>
      `expected ${path} ${allowed.join(" or ")}, got ${track.state ?? "active"}`,
  );
}

/**
 * A clip's loop switch.
 *
 * @param path - Clip to read
 * @param expected - Looping the turn asked for
 * @returns A state assertion over the clip's timing
 */
function assertLooping(path: string, expected: boolean): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: { path, include: ["timing"] },
    expect: (result) => (result as { looping?: boolean }).looping === expected,
    explain: (result) =>
      `expected ${path} looping ${String(expected)}, got ` +
      String((result as { looping?: boolean }).looping),
  };
}

/**
 * A scene's tempo. read-scene reports it only once the scene enables it, so an
 * absent value means the write never happened.
 *
 * @param path - Scene to read
 * @param bpm - Tempo the turn asked for
 * @returns A state assertion over the scene
 */
function assertSceneTempo(path: string, bpm: number): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_SCENE,
    args: { path },
    expect: (result) => (result as { tempo?: number }).tempo === bpm,
    explain: (result) =>
      `expected scene ${path} at ${bpm} BPM, got ` +
      `${(result as { tempo?: number }).tempo ?? "no scene tempo"}`,
  };
}

/**
 * One update-track call carried this param for every track it named.
 *
 * This grades the reach-for — whether the model paired the values in a single
 * call — not where they landed, which the state assertions pin. Relax it to a
 * signal (or drop it) if transcripts show models splitting the write per track
 * and still getting the state right.
 *
 * @param turn - Turn whose calls to read
 * @param param - The per-target param under test
 * @returns A custom assertion over the args the model sent
 */
function assertPairedInOneCall(turn: number, param: string): EvalAssertion {
  return {
    type: "custom",
    description: `one ${TOOL_UPDATE_TRACK} call pairs ${param} with its targets`,
    assert: (turns: EvalTurnResult[]) => {
      const calls = getToolCalls(turns, turn).filter(
        (call) =>
          call.name === TOOL_UPDATE_TRACK &&
          listEntries(call.args[param]).length > 0,
      );
      const [call] = calls;

      if (call == null) {
        throw new Error(`no ${TOOL_UPDATE_TRACK} call carried ${param}`);
      }

      if (calls.length > 1) {
        throw new Error(
          `${calls.length} ${TOOL_UPDATE_TRACK} calls carried ${param} — one ` +
            `call should pair one value per track`,
        );
      }

      const values = listEntries(call.args[param]);
      const targets = listEntries(call.args.path ?? call.args.id);

      if (values.length !== targets.length && values.length !== 1) {
        throw new Error(
          `${param} named ${values.length} value(s) for ${targets.length} ` +
            `target(s): ${values.join(",")} vs ${targets.join(",")}`,
        );
      }

      return true;
    },
  };
}

/**
 * A looping one-bar MIDI clip in the Lead track's first scene, so the turn that
 * turns looping off has something to turn off. Clears the slot first so a run
 * against an already-open Set starts from identical state.
 *
 * @param mcpClient - MCP client for tool calls
 */
async function setupLoopingClip(mcpClient: Client): Promise<void> {
  await clearClipSlots(mcpClient, [LEAD_SLOT]);
  await mcpClient.callTool({
    name: "ppal-create-clip",
    arguments: {
      path: LEAD_SLOT_PATH,
      length: "1bar",
      timeSignature: "4/4",
      looping: true,
      name: "paired-values-loop",
      notes: "n/4 C3 1|1,2,3,4",
    },
  });
}

export const pairedValuesSingle: EvalScenario = {
  id: "paired-values-single",
  tags: ["workflow", "pairing"],
  description: "A single typed value per write, across four param families",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // monitoringState is hidden from small-model mode, so this whole scenario
  // skips there. paired-values-multi carries the small-model coverage.
  requires: { params: ["monitoringState"] },
  // The state read-backs pin every outcome; the judge only adds commentary.
  judgeAdvisory: true,

  setup: setupLoopingClip,

  messages: [
    MSG_CONNECT,
    "Set the Drums track's input monitoring to In",
    "Arm the Bass track",
    "Turn off looping on the clip in the Lead track's first scene",
    "Set scene 2's tempo to 90",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: 1 },
    assertMonitoring(DRUMS, "in"),

    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: 2 },
    assertArmed(BASS),

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3 },
    assertLooping(LEAD_SLOT_PATH, false),

    { type: "tool_called", tool: TOOL_UPDATE_SCENE, turn: 4 },
    assertSceneTempo(SCENE_2, SCENE_TEMPO),

    { type: "token_usage", maxTokens: 3_000 },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Set the Drums track's input monitoring to In
2. Record armed the Bass track
3. Turned looping off on the Lead track's first clip
4. Set scene 2's tempo to 90 BPM
5. Changed only what each request named`,
    },
  ],
};

export const pairedValuesMulti: EvalScenario = {
  id: "paired-values-multi",
  tags: ["workflow", "pairing"],
  description: "Different values on three named tracks, paired in one write",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // No reuseLiveSet: the gains and the mute/solo persist, so a second trial
  // would start with some of them already right.
  judgeAdvisory: true,

  messages: [
    MSG_CONNECT,
    "Set the volumes: Drums to -3 dB, Bass to -8, Chords to -12",
    // Last, because soloing re-reports every other track as muted-via-solo.
    "Mute the Drums and Bass tracks, and solo the Chords track",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: 1 },
    assertGain(DRUMS, DRUMS_DB),
    assertGain(BASS, BASS_DB),
    assertGain(CHORDS, CHORDS_DB),
    assertPairedInOneCall(1, "gainDb"),

    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: 2 },
    assertTrackState(DRUMS, MUTED),
    assertTrackState(BASS, MUTED),
    assertTrackState(CHORDS, ["soloed"]),
    assertTrackState(LEAD, ["muted-via-solo"]),
    assertPairedInOneCall(2, "mute"),

    { type: "token_usage", maxTokens: 2_000 },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Set the Drums, Bass and Chords volumes to -3, -8 and -12 dB respectively
2. Muted the Drums and Bass tracks
3. Soloed the Chords track
4. Left the Lead track's own mixer settings alone`,
    },
  ],
};
