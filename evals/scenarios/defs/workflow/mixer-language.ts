// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: plain mixer language — gain, pan, solo — on tracks named, not indexed.
 */

import { type EvalAssertion, type EvalScenario } from "../../types.ts";

const TOOL_UPDATE_TRACK = "ppal-update-track";

/** Tracks of the basic-midi-4-track Live Set this scenario touches. */
const DRUMS = 0;
const BASS = 1;
const CHORDS = 2;

/** The gain turn 1 asks for, in dB. */
const BASS_DB = -12;
/** Live quantizes a dB write, so compare with slack rather than for equality. */
const DB_TOLERANCE = 0.2;

/**
 * A track's mixer, read back after the turns.
 *
 * @param trackIndex - Track to read
 * @param expect - Matcher over the mixer read
 * @param explain - Diagnostic for a failed match
 * @returns A state assertion over the track's mixer
 */
function assertMixer(
  trackIndex: number,
  expect: (result: MixerRead) => boolean,
  explain: (result: MixerRead) => string,
): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-track",
    args: { trackIndex, include: ["mixer"] },
    expect: (result) => expect(result as MixerRead),
    explain: (result) => explain(result as MixerRead),
  };
}

/** The mixer fields read-track reports. Defaults are omitted to save tokens. */
interface MixerRead {
  gainDb?: number;
  pan?: number;
  state?: string;
}

export const mixerLanguage: EvalScenario = {
  id: "mixer-language",
  description: "Set a track's gain, pan and solo from plain mixer language",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // Deliberately no `requires`: gainDb/pan/solo are in every schema mode, and
  // small-model mode is exactly where plain mixer language matters most.
  // The checks below pin the outcome; the judge only adds commentary.
  judgeAdvisory: true,

  messages: [
    "Connect to Ableton Live",
    "Turn the Bass track down to -12 dB",
    "Pan the Drums hard left",
    // Last, because soloing re-reports every other track as muted-via-solo.
    "Solo the Chords track",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: 1 },
    assertMixer(
      BASS,
      (mixer) => Math.abs((mixer.gainDb ?? 0) - BASS_DB) <= DB_TOLERANCE,
      (mixer) => `expected Bass at ${BASS_DB} dB, got ${mixer.gainDb ?? 0}`,
    ),

    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: 2 },
    assertMixer(
      DRUMS,
      (mixer) => mixer.pan === -1,
      (mixer) => `expected Drums panned hard left (-1), got ${mixer.pan ?? 0}`,
    ),

    { type: "tool_called", tool: TOOL_UPDATE_TRACK, turn: 3 },
    assertMixer(
      CHORDS,
      (mixer) => mixer.state === "soloed",
      (mixer) => `expected Chords soloed, got ${mixer.state ?? "active"}`,
    ),

    { type: "response_contains", pattern: /-12|12 ?db/i, turn: 1 },
    { type: "response_contains", pattern: /pan|left/i, turn: 2 },
    { type: "response_contains", pattern: /solo/i, turn: 3 },

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Set the Bass track's volume to -12 dB
2. Panned the Drums track hard left
3. Soloed the Chords track
4. Changed only the track each request named`,
    },
  ],
};
