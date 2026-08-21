// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario builders for create-clip eval scenarios — the shared shell the
 * notation suites fill in. The assertion helpers they compose live in
 * clip-scenario-helpers.ts.
 */

import {
  type EvalAssertion,
  type EvalScenario,
  type ScenarioRequirements,
} from "../../../types.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  clearSessionSlots,
  clipStateAssertion,
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_CREATE_CLIP,
} from "./clip-scenario-helpers.ts";

/** basic-midi-4-track: the 4-track Live Set shared by Lead-track notation scenarios. */
export const LEAD_LIVE_SET = "basic-midi-4-track";
/** Lead is track 3 in basic-midi-4-track — a melodic (non-drum) track. */
export const LEAD_TRACK = 3;
/** Scene-1 clip slot on the Lead track. */
export const LEAD_SLOT_1 = `${LEAD_TRACK}/0`;

/**
 * Build a create-clip scenario shell: clear the slots, connect (turn 0), then
 * the caller's create-clip turns. Callers supply only the assertions that grade
 * the result — the connect and create-clip checks are always present. The LLM
 * judge is advisory in all of these (judges miscount bar|beat notation).
 *
 * @param config - Scenario specifics
 * @param config.id - Scenario id
 * @param config.description - One-line description
 * @param config.messages - User turns after the connect turn
 * @param config.clearSlots - Clip slots to clear in setup
 * @param config.assertions - Assertions after the connect + create-clip checks
 * @param config.liveSet - Live Set to open (defaults to basic-midi-4-track)
 * @param config.requires - Capability requirements (e.g. `{ brackets: true }`)
 * @returns The assembled eval scenario
 */
export function createClipScenario(config: {
  id: string;
  description: string;
  messages: string[];
  clearSlots: string[];
  assertions: EvalAssertion[];
  liveSet?: string;
  requires?: ScenarioRequirements;
}): EvalScenario {
  return {
    id: config.id,
    description: config.description,
    kind: "capability",
    ...(config.requires && { requires: config.requires }),
    liveSet: config.liveSet ?? LEAD_LIVE_SET,
    judgeAdvisory: true,
    messages: [MSG_CONNECT, ...config.messages],
    setup: (mcpClient) => clearSessionSlots(mcpClient, config.clearSlots),
    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
      ...config.assertions,
    ],
  };
}

/**
 * Build a single-create-clip notation scenario on the Lead track of
 * basic-midi-4-track: connect (turn 0), then one create-clip (turn 1) whose
 * scene-1 read-back is re-interpreted in 4/4 and graded by `check`, with the LLM
 * judge advisory. Shared by the value-stream and multi-bar-spread scenarios —
 * only the prompt, the read-back check, and the judge prompt differ. Grades the
 * OUTCOME (final clip state), so it is agnostic to how the model placed the
 * notes (brackets, repeats, or hand-enumerated positions).
 *
 * @param config - Scenario specifics
 * @param config.id - Scenario id
 * @param config.description - One-line description
 * @param config.message - User turn after the connect turn
 * @param config.check - Read-back verdict over the re-interpreted notes (4/4)
 * @param config.judgePrompt - Advisory LLM-judge prompt
 * @param config.requires - Capability requirements (e.g. `{ brackets: true }`)
 * @returns The assembled eval scenario
 */
export function leadClipNotationScenario(config: {
  id: string;
  description: string;
  message: string;
  check: (events: NoteEvent[]) => boolean;
  judgePrompt: string;
  /** Capability requirements (e.g. `{ brackets: true }` for stream-notation
   *  scenarios). Omit for plain bar|beat notation taught in the basic tier. */
  requires?: ScenarioRequirements;
}): EvalScenario {
  return createClipScenario({
    id: config.id,
    description: config.description,
    requires: config.requires,
    messages: [config.message],
    clearSlots: [LEAD_SLOT_1],
    assertions: [
      clipStateAssertion(LEAD_SLOT_1, "4/4", config.check),
      { type: "llm_judge", prompt: config.judgePrompt },
      { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
    ],
  });
}
