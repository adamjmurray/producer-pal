// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared scaffolding for Abstark notation eval scenarios.
 *
 * Abstark is a global notation setting (device Settings), so these scenarios set
 * `config: { notation: "abstark" }` — the model then authors clips in Abstark and
 * read-clip returns Abstark. Grading re-interprets the read-back notes with the
 * Abstark interpreter and checks pitch / start / duration; velocity is bucketed
 * (3 dynamics) so it is never asserted. That interpret→serialize→interpret path
 * IS the round-trip under test.
 *
 * Abstark is taught in the standard skills tier only, so small-model runs (basic
 * skills) can't author it — the shared builder marks scenarios `largeModel` so
 * they are skipped (not failed) there.
 */

import { interpretNotation } from "#src/notation/abstark/abstark-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  type ConfigOptions,
  type EvalAssertion,
  type EvalScenario,
} from "../../../../types.ts";
import {
  clearSessionSlots,
  clipStateAssertion,
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../../clip-scenario-helpers.ts";

/** create-clip tool name (turn-1 create assertion). */
const TOOL_CREATE_CLIP = "ppal-create-clip";

/** Shared 4-track set: track 0 = Drums (Drum Rack), track 3 = Lead (melodic). */
export const ABSTARK_LIVE_SET = "basic-midi-4-track";

/** Lead track index in basic-midi-4-track (melodic → pitched serialization). */
export const LEAD_TRACK = 3;

/** Drums track index in basic-midi-4-track (Drum Rack → drum serialization). */
export const DRUMS_TRACK = 0;

/** Config that switches the server to Abstark notation for the scenario run. */
const ABSTARK_CONFIG: ConfigOptions = { notation: "abstark" };

// Shared read-back verdict helpers (notation-agnostic) live in
// clip-scenario-helpers; re-exported so Abstark scenarios import them from here.
export { notesMatch, type ExpectedNote } from "../../clip-scenario-helpers.ts";

/**
 * Abstark flavor of {@link clipStateAssertion}: re-reads the clip in `slot` and
 * re-interprets its notes with the Abstark interpreter before grading. Grades
 * the OUTCOME (final clip state), not the create transcript, so it is agnostic
 * to exactly how the model spelled the Abstark. Fails closed on a wrong/absent
 * time signature, missing notes, or unparseable notation.
 *
 * @param slot - Session clip slot to read (trackIndex/sceneIndex)
 * @param meter - Expected time signature (e.g. "4/4"); also the interpret meter
 * @param check - Verdict over the re-interpreted notes (start_time in Ableton
 *   quarter beats); only called once the read succeeded in `meter`
 * @returns State assertion
 */
export function abstarkClipStateAssertion(
  slot: string,
  meter: string,
  check: (events: NoteEvent[]) => boolean,
): EvalAssertion {
  return clipStateAssertion(slot, meter, check, interpretNotation);
}

/**
 * Assemble a single-create-clip Abstark scenario: connect (turn 0), then one
 * create-clip (turn 1) whose read-back is graded by the supplied state
 * assertions. Every Abstark scenario shares this shape, so the scaffolding
 * (Abstark config, small-model skip, connect/create/judge/token assertions,
 * slot-clearing setup) lives here and each scenario supplies only what differs.
 *
 * @param opts - Scenario specifics
 * @param opts.id - Scenario id
 * @param opts.description - One-line description
 * @param opts.prompt - The user turn after the connect turn
 * @param opts.slots - Session slots to clear in setup (and that the checks read)
 * @param opts.checks - Read-back state assertions
 * @param opts.judgePrompt - Advisory LLM-judge prompt
 * @param opts.liveSet - Live Set (defaults to basic-midi-4-track)
 * @returns The assembled eval scenario
 */
export function abstarkScenario(opts: {
  id: string;
  description: string;
  prompt: string;
  slots: string[];
  checks: EvalAssertion[];
  judgePrompt: string;
  liveSet?: string;
}): EvalScenario {
  return {
    id: opts.id,
    description: opts.description,
    kind: "capability",
    requires: { largeModel: true },
    liveSet: opts.liveSet ?? ABSTARK_LIVE_SET,
    config: ABSTARK_CONFIG,
    judgeAdvisory: true,
    messages: [MSG_CONNECT, opts.prompt],
    setup: (mcpClient) => clearSessionSlots(mcpClient, opts.slots),
    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
      ...opts.checks,
      { type: "llm_judge", prompt: opts.judgePrompt },
      { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
    ],
  };
}
