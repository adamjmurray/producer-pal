// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios for value streams (velocity + duration pattern brackets, AJM-483).
 *
 * A value bracket `[v110 v70]` cycles a velocity across notes — `[v110 v70] C3
 * 1|1x8@n/8` is a loud/soft alternating line. A duration bracket with no `@step`
 * (`[n3/16 n/16] C3 1|1x8`) folds its cycled lengths into the SPACING too — a
 * galloping rhythm. Like the pitch-stream scenarios, both grade the OUTCOME (the
 * read-back velocities/positions), not the path: the model may cycle with a
 * bracket or hand-write the changes — brackets are author-only sugar with the
 * same canonical read-back. The signal a note count can't see is the PATTERN: a
 * real velocity alternation (110, 70, …), or a long-short gallop rather than
 * even notes.
 *
 * Deterministic read-back assertions are authoritative; the LLM judge is
 * advisory (judges miscount bar|beat notation).
 */

import { type NoteEvent } from "#src/notation/types.ts";
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
 * Build a read-back check for an eight-note C3 line: require exactly eight
 * notes, sort by start time, then assert every note is C3 (pitch 60) and passes
 * `perNote` (the scenario-specific position/velocity predicate).
 * @param perNote - Per-note predicate over the time-sorted note and its index
 * @returns A check for `clipStateAssertion`
 */
function eightNoteCheck(
  perNote: (event: NoteEvent, index: number) => boolean,
): (events: NoteEvent[]) => boolean {
  return (events) => {
    if (events.length !== 8) return false;

    const sorted = [...events].sort((a, b) => a.start_time - b.start_time);

    return sorted.every((e, i) => e.pitch === 60 && perNote(e, i));
  };
}

/**
 * Build a single-create-clip notation scenario on the Lead track: connect, then
 * one `create-clip` whose read-back is graded by `check` (against the
 * re-interpreted notes in 4/4) with the LLM judge advisory. Both value-stream
 * scenarios share this skeleton; only the prompt, the read-back check, and the
 * judge prompt differ.
 * @param config - Scenario specifics
 * @param config.id - Scenario id
 * @param config.description - One-line description
 * @param config.message - User turn after the connect turn
 * @param config.check - Read-back verdict over the re-interpreted notes
 * @param config.judgePrompt - Advisory LLM-judge prompt
 * @returns The assembled eval scenario
 */
function leadClipScenario(config: {
  id: string;
  description: string;
  message: string;
  check: (events: NoteEvent[]) => boolean;
  judgePrompt: string;
}): EvalScenario {
  return {
    id: config.id,
    description: config.description,
    kind: "capability",
    liveSet: LIVE_SET,
    judgeAdvisory: true,
    messages: [MSG_CONNECT, config.message],
    setup: (mcpClient) => clearSessionSlots(mcpClient, [`${LEAD_TRACK}/0`]),
    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
      clipStateAssertion(`${LEAD_TRACK}/0`, "4/4", config.check),
      { type: "llm_judge", prompt: config.judgePrompt },
      { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
    ],
  };
}

/**
 * Loud/soft alternating eighth-note line: velocity cycles 110, 70 across eight
 * eighth notes filling a 4/4 bar. The canonical bracket form is
 * `[v110 v70] C3 1|1x8@n/8`. The read-back checks every note's pitch, position
 * (eighths at Ableton beats 0, 0.5, …, 3.5), and the alternating velocity — the
 * accent pattern is the part a note count alone can't verify.
 */
export const barBeatVelocityAccent: EvalScenario = leadClipScenario({
  id: "bar-beat-velocity-accent",
  description:
    "Alternating loud/soft eighth-note line — velocity cycling across a bar",
  message:
    "On the Lead track, create a 1-bar MIDI clip in scene 1: eight eighth notes on C3 filling the bar, alternating velocity loud then soft — 110, 70, 110, 70, and so on.",
  check: eightNoteCheck(
    (e, i) =>
      Math.abs(e.start_time - i * 0.5) < EPS &&
      e.velocity === (i % 2 === 0 ? 110 : 70),
  ),
  judgePrompt: `Evaluate if the assistant:
1. Created a clip with eight eighth notes on C3 filling a 4/4 bar (Ableton beats 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5)
2. Alternated the velocity loud/soft across the line: 110, 70, 110, 70, … — a real alternation, NOT one flat velocity`,
});

/** Dotted-eighth + sixteenth onsets repeating across a 4/4 bar (4 pairs). */
const GALLOP_ONSETS = [0, 0.75, 1, 1.75, 2, 2.75, 3, 3.75];

/**
 * A galloping rhythm: dotted-eighth then sixteenth pairs repeating across a 4/4
 * bar (eight notes on C3). The canonical bracket form is `[n3/16 n/16] C3 1|1x8`
 * — with no `@step`, the duration stream folds its long/short lengths into the
 * note SPACING, producing the uneven gallop onsets. The read-back grades the
 * onset pattern (the long-short spacing a note count can't see); durations are
 * left to the advisory judge since a hand-written gallop may voice lengths
 * differently while keeping the same onsets.
 */
export const barBeatGallop: EvalScenario = leadClipScenario({
  id: "bar-beat-gallop",
  description: "Galloping dotted-8th + 16th rhythm — duration-fold spacing",
  message:
    "On the Lead track, create a 1-bar MIDI clip in scene 1: a galloping rhythm on C3 — a dotted-eighth note followed by a sixteenth note, that pair repeating to fill the 4/4 bar (four pairs, eight notes).",
  check: eightNoteCheck(
    (e, i) => Math.abs(e.start_time - (GALLOP_ONSETS[i] as number)) < EPS,
  ),
  judgePrompt: `Evaluate if the assistant:
1. Created a clip with eight notes on C3 filling a 4/4 bar
2. Produced a GALLOP rhythm — dotted-eighth + sixteenth pairs (onsets at Ableton beats 0, 0.75, 1, 1.75, 2, 2.75, 3, 3.75), a long-short feel, NOT eight even notes`,
});
