// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario for value streams (velocity pattern brackets, AJM-483).
 *
 * A value bracket `[v110 v70]` cycles a velocity across notes — `[v110 v70] C3
 * 1|1x8@n/8` is a loud/soft alternating line. Like the pitch-stream scenarios,
 * this grades the OUTCOME (the read-back velocities + positions), not the path:
 * the model may cycle with a bracket or hand-write each `v` change — brackets
 * are author-only sugar with the same canonical read-back. The signal velocity
 * counts can't see is the PATTERN: a real alternation (110, 70, 110, …), not one
 * flat velocity, on correctly-spaced eighth notes.
 *
 * Deterministic read-back assertions are authoritative; the LLM judge is
 * advisory (judges miscount bar|beat notation).
 */

import { type EvalScenario } from "../../../types.ts";
import {
  clearSessionSlots,
  clipStateAssertion,
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip-scenario-helpers.ts";

const TOOL_CREATE_CLIP = "ppal-create-clip";
const LIVE_SET = "basic-midi-4-track";
/** Lead is track 3 in basic-midi-4-track — a melodic (non-drum) track. */
const LEAD_TRACK = 3;
/** Float tolerance for note start_time comparisons (in beats). */
const EPS = 1e-6;

/**
 * Loud/soft alternating eighth-note line: velocity cycles 110, 70 across eight
 * eighth notes filling a 4/4 bar. The canonical bracket form is
 * `[v110 v70] C3 1|1x8@n/8`. The read-back checks every note's pitch, position
 * (eighths at Ableton beats 0, 0.5, …, 3.5), and the alternating velocity — the
 * accent pattern is the part a note count alone can't verify.
 */
export const barBeatVelocityAccent: EvalScenario = {
  id: "bar-beat-velocity-accent",
  description:
    "Alternating loud/soft eighth-note line — velocity cycling across a bar",
  kind: "capability",
  liveSet: LIVE_SET,
  judgeAdvisory: true,
  messages: [
    MSG_CONNECT,
    "On the Lead track, create a 1-bar MIDI clip in scene 1: eight eighth notes on C3 filling the bar, alternating velocity loud then soft — 110, 70, 110, 70, and so on.",
  ],
  setup: (mcpClient) => clearSessionSlots(mcpClient, [`${LEAD_TRACK}/0`]),
  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    clipStateAssertion(`${LEAD_TRACK}/0`, "4/4", (events) => {
      if (events.length !== 8) return false;

      const sorted = [...events].sort((a, b) => a.start_time - b.start_time);

      return sorted.every(
        (e, i) =>
          e.pitch === 60 &&
          Math.abs(e.start_time - i * 0.5) < EPS &&
          e.velocity === (i % 2 === 0 ? 110 : 70),
      );
    }),
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a clip with eight eighth notes on C3 filling a 4/4 bar (Ableton beats 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5)
2. Alternated the velocity loud/soft across the line: 110, 70, 110, 70, … — a real alternation, NOT one flat velocity`,
    },
    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
