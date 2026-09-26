// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared scaffolding for the preTransforms reach-for scenarios: the edit a
// classifier reads, and the scenario shell that records its verdict.

import { argText } from "../../arg-text.ts";
import { getToolCalls } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import { assertNotesRead } from "../helpers/clip-note-assertions.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "../helpers/clip-tool-constants.ts";

/** The 2-bar drum + lead Live Set these scenarios rewrite in. */
const LIVE_SET = "basic-with-drum-and-lead-clips";

/** A `v0` token in a notes arg: the clear was encoded inline. */
export const NOTES_V0 = /(^|\s)v0(\s|$)/;

export type UpdateClipCall = ReturnType<typeof getToolCalls>[number];

/** A rewrite turn's update-clip calls, plus the first one that reached. */
export interface RewriteEdit {
  calls: UpdateClipCall[];
  reach: UpdateClipCall | undefined;
}

/**
 * Read a rewrite turn's update-clip calls and pick out the preTransforms reach.
 *
 * @param turns - All turn results
 * @param turn - Turn index that rewrote
 * @returns The turn's calls and the reaching one
 */
export function readRewriteEdit(
  turns: EvalTurnResult[],
  turn: number,
): RewriteEdit {
  const calls = getToolCalls(turns, turn).filter(
    (c) => c.name === TOOL_UPDATE_CLIP,
  );

  return {
    calls,
    reach: calls.find(
      (c) =>
        c.args.preTransforms != null &&
        argText(c.args.preTransforms).trim() !== "",
    ),
  };
}

/** What a classifier reports about the path a model took. */
export interface ClassifiedPath {
  path: string;
  evidence: string;
  updateCalls?: number;
}

/** A log-line tag, the classifier behind it, and its "unrecognized" message. */
export interface PathGrade {
  label: string;
  classify: (turns: EvalTurnResult[], turn: number) => ClassifiedPath;
  failure: string;
}

/**
 * Assemble a preTransforms rewrite scenario: connect, read the clip, then the
 * edit instruction. The classification is the result being compared, so it is
 * logged and only `"unrecognized"` fails.
 *
 * @param spec - Ids, the read and edit messages, the grade, the token budget
 * @returns The assembled eval scenario
 */
export function pretransformsScenario(spec: {
  id: string;
  description: string;
  readMessage: string;
  editInstruction: string;
  grade: PathGrade;
  maxTokens: number;
}): EvalScenario {
  return {
    id: spec.id,
    description: spec.description,
    kind: "capability",
    tags: ["transforms"],
    liveSet: LIVE_SET,

    messages: [MSG_CONNECT, spec.readMessage, spec.editInstruction],

    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      assertNotesRead(1),
      { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: EDIT_TURN },
      recordPath(spec.grade),
      { type: "token_usage", maxTokens: spec.maxTokens },
    ],
  };
}

/** Turn 0 connects, turn 1 reads, turn 2 edits. */
const EDIT_TURN = 2;

// Pass-only: console.log surfaces the classification in the eval output.
function recordPath(grade: PathGrade): EvalAssertion {
  return {
    type: "custom",
    description: `classify ${grade.label} at turn ${EDIT_TURN}`,
    assert: (turns) => {
      const { path, evidence, updateCalls } = grade.classify(turns, EDIT_TURN);
      const counted = updateCalls == null ? "" : ` updateCalls=${updateCalls}`;

      console.log(
        `    [${grade.label}@turn${EDIT_TURN}] path=${path}${counted} — ${evidence}`,
      );

      if (path === "unrecognized") {
        throw new Error(`${grade.failure}: ${evidence}`);
      }

      return true;
    },
  };
}
