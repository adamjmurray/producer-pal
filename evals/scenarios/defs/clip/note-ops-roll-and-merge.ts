// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Note-count transform idioms: does the model reach for ratchet()/merge() —
 * the statement-level note-count operations — rather than hand-rewriting the
 * clip note by note?
 *
 * Both grade the IDIOM (the transform string the model emitted) plus the
 * direction of the note-count change read back from the update-clip result:
 *   - ratchet: a roll should ADD notes (each note → several)
 *   - merge:   gluing repeated same-pitch notes should REMOVE notes
 * The LLM judge is advisory; the deterministic idiom + count-direction check is
 * the authoritative grade.
 *
 * Requires Ableton (real device + LLM): `npm run build:debug` then
 * `./scripts/eval -m google/gemini-3.5-flash -t note-ops-ratchet-roll -t note-ops-merge`.
 * Validated vs Live 2026-06-06: both PASS 4/4 — the model reached for the exact
 * idioms (`ratchet(4)` grew 12→48 notes; `merge()` collapsed to one note per
 * drum pitch), judges pass.
 */

import { parseToolResult } from "#evals/chat/mcp.ts";
import { getToolCalls } from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";
import {
  assertNotesRead,
  getTransforms,
  MSG_CONNECT,
  readClipNotesFromTurn,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "./clip-scenario-helpers.ts";

const LIVE_SET = "basic-with-drum-and-lead-clips";

/**
 * Read the resulting noteCount from a ppal-update-clip call's result.
 * @param turns - All turn results
 * @param turn - Turn index containing the update-clip call
 * @returns The post-update note count, or null when unavailable
 */
function updateNoteCount(turns: EvalTurnResult[], turn: number): number | null {
  const call = getToolCalls(turns, turn).find(
    (c) => c.name === TOOL_UPDATE_CLIP,
  );

  if (call?.result == null) return null;

  const parsed = parseToolResult(String(call.result)) as { noteCount?: number };

  return parsed.noteCount ?? null;
}

/**
 * Assert a note op ran and moved the note count in the expected direction.
 * @param readTurn - Turn whose read established the original note count
 * @param editTurn - Turn that applied the note-op transform
 * @param opPattern - Idiom regex the transforms string must match (ratchet/merge)
 * @param direction - "grow" (ratchet) or "shrink" (merge)
 * @returns A custom assertion
 */
function assertNoteOp(
  readTurn: number,
  editTurn: number,
  opPattern: RegExp,
  direction: "grow" | "shrink",
): EvalAssertion {
  return {
    type: "custom",
    description: `used ${opPattern.source} and the note count ${direction === "grow" ? "increased" : "decreased"}`,
    assert: (turns) => {
      const transforms = getTransforms(turns, editTurn, TOOL_UPDATE_CLIP);

      if (!opPattern.test(transforms)) {
        throw new Error(
          `expected a ${opPattern.source} note op: ${transforms.slice(0, 120)}`,
        );
      }

      const before = readClipNotesFromTurn(turns, readTurn)?.notes.length ?? 0;
      const after = updateNoteCount(turns, editTurn);

      if (after == null) {
        throw new Error("could not read the post-update note count");
      }

      if (direction === "grow" && after <= before) {
        throw new Error(
          `ratchet should increase the note count (before ${before}, after ${after})`,
        );
      }

      if (direction === "shrink" && after >= before) {
        throw new Error(
          `merge should decrease the note count (before ${before}, after ${after})`,
        );
      }

      return true;
    },
  };
}

export const noteOpsRatchetRoll: EvalScenario = {
  id: "note-ops-ratchet-roll",
  description: "Turn each note of a melody into a roll via ratchet()",
  kind: "capability",
  requires: { transforms: true },
  liveSet: LIVE_SET,
  judgeAdvisory: true,

  messages: [
    MSG_CONNECT,
    "Find the lead melody clip in the first scene and read its notes",
    "Turn each note of that melody into a four-note roll",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertNotesRead(1),
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    assertNoteOp(1, 2, /ratchet\(/, "grow"),
    {
      type: "llm_judge",
      prompt: `Evaluate turn 2: each note of the lead melody was turned into a four-note roll (a ratchet) using the ratchet() note-count transform, NOT by hand-listing every individual note. The result should have roughly four times as many notes, each at the same pitch, evenly dividing the original note's duration.`,
    },
    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
  ],
};

export const noteOpsMerge: EvalScenario = {
  id: "note-ops-merge",
  description:
    "Glue repeated same-pitch drum hits into sustained notes via merge()",
  kind: "capability",
  requires: { transforms: true },
  liveSet: LIVE_SET,
  judgeAdvisory: true,

  messages: [
    MSG_CONNECT,
    "Find the drum clip in the first scene and read its notes",
    "Each drum lane has many separate repeated hits. Combine the repeated hits in each lane into a single sustained note per lane.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertNotesRead(1),
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    assertNoteOp(1, 2, /merge\(/, "shrink"),
    {
      type: "llm_judge",
      prompt: `Evaluate turn 2: the repeated same-pitch hits in each drum lane were combined into one sustained note per lane using the merge() note-count transform, NOT by hand-rewriting the clip. The result should have far fewer notes (about one per distinct drum pitch).`,
    },
    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
  ],
};
