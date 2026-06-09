// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: value-based note selection with where() predicates. The requests
 * are deliberately phrased by note VALUE ("the quiet notes", "the loud ones"),
 * not by position — the path where() exists for and positional pitch/time
 * selectors cannot express. The capability under test is whether the model
 * reaches for `where(note.velocity ...)` rather than reading every note and
 * hand-listing positions.
 *
 * `setup` installs a deterministic clip mixing genuinely quiet (<50) and loud
 * (>90) notes, so every trial has real targets for both operations and repeat
 * runs (`-r N`, which reuse the open Live Set) start from the same state.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getToolCalls } from "../../assertions/index.ts";
import { type EvalScenario, type EvalTurnResult } from "../../types.ts";
import {
  assertNotesRead,
  clearSessionSlots,
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "./clip-scenario-helpers.ts";

const LIVE_SET = "basic-midi-4-track";
const SLOT = "0/0";
/** Eight quarter notes alternating quiet (30/40/35/45) and loud (110/100/105/120). */
const TEST_NOTES =
  "n/4 v30 C3 1|1 v110 D3 1|2 v40 E3 1|3 v100 F3 1|4 v35 G3 2|1 v105 A3 2|2 v45 B3 2|3 v120 C4 2|4";

/**
 * Rebuild the deterministic mixed-velocity test clip in slot 0/0. Clears the
 * slot first so repeat trials start from identical state.
 * @param mcpClient - MCP client for tool calls
 */
async function setupWhereClip(mcpClient: Client): Promise<void> {
  await clearSessionSlots(mcpClient, [SLOT]);
  await mcpClient.callTool({
    name: "ppal-create-clip",
    arguments: {
      slot: SLOT,
      length: "2bar",
      timeSignature: "4/4",
      name: "where-test",
      notes: TEST_NOTES,
    },
  });
}

/**
 * Normalize a transforms/preTransforms argument value to a string (joining an
 * array of lines), tolerating null/undefined as empty.
 * @param raw - The raw argument value (string, string[], or nullish)
 * @returns The normalized string ("" when absent)
 */
function toTransformString(raw: unknown): string {
  return Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");
}

/**
 * Pull the where()-bearing transform string from a turn's update-clip call,
 * accepting it in EITHER `transforms` or `preTransforms`. Deleting/altering
 * existing notes via `preTransforms` is the idiomatic path (the skills call it
 * "the way" to do it), so both params are valid homes for the predicate.
 * @param turns - All turn results
 * @param turn - Turn index that ran update-clip
 * @returns The combined transform string (transforms then preTransforms)
 */
function getWhereTransform(turns: EvalTurnResult[], turn: number): string {
  const call = getToolCalls(turns, turn).find(
    (c) => c.name === TOOL_UPDATE_CLIP,
  );

  if (!call) {
    throw new Error(`no ${TOOL_UPDATE_CLIP} call in turn ${turn}`);
  }

  const combined = [
    toTransformString(call.args.transforms),
    toTransformString(call.args.preTransforms),
  ]
    .filter(Boolean)
    .join("\n");

  if (!combined) {
    throw new Error(`no transforms/preTransforms in turn ${turn}`);
  }

  return combined;
}

/**
 * Extract the selector (text before the first `:`) from a where()-bearing
 * transform/preTransform string.
 * @param transforms - The transform string
 * @returns The selector portion (before the first `:`)
 */
function getSelector(transforms: string): string {
  const colonIdx = transforms.indexOf(":");

  if (colonIdx === -1) {
    throw new Error(`missing selector (no ":"): ${transforms}`);
  }

  return transforms.slice(0, colonIdx);
}

export const whereTransforms: EvalScenario = {
  id: "where-transforms",
  description: "Select notes by value with where() predicates",
  kind: "capability",
  requires: { transforms: true },
  liveSet: LIVE_SET,
  setup: setupWhereClip,

  messages: [
    MSG_CONNECT,
    "Read the notes in the clip in track 1",
    "Delete all the quiet notes — anything below velocity 50",
    "Now make the loud notes that are left — over velocity 90 — another 20 louder",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertNotesRead(1),

    // Turn 2: delete quiet notes via a where() velocity predicate + delete
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    {
      type: "custom",
      description: "deletes quiet notes with where(note.velocity < ~50) + v0",
      assert: (turns) => {
        const transforms = getWhereTransform(turns, 2);
        const selector = getSelector(transforms);

        if (!/where\s*\(/.test(selector)) {
          throw new Error(`expected a where() selector: ${transforms}`);
        }

        // A one-sided velocity threshold near 50 (allow < or <=, 40-60).
        const cmp = /note\.velocity\s*<=?\s*(\d+)/.exec(transforms);

        if (!cmp) {
          throw new Error(`expected where(note.velocity < N): ${transforms}`);
        }

        const threshold = Number(cmp[1]);

        if (threshold < 40 || threshold > 60) {
          throw new Error(
            `velocity threshold ${threshold} should be ~50 (40-60): ${transforms}`,
          );
        }

        // Delete: the `delete` keyword, the v0 shorthand, or longhand
        // velocity = 0 (skills now lead with `delete`, but v0 stays valid).
        if (!/(\bdelete\b|\bv0\b|velocity\s*=\s*0\b)/.test(transforms)) {
          throw new Error(
            `expected a delete (delete / v0 / velocity = 0): ${transforms}`,
          );
        }

        return true;
      },
    },

    // Turn 3: accent loud notes via a where() velocity predicate + additive
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3 },
    {
      type: "custom",
      description: "accents loud notes with where(note.velocity > ~90) + += 20",
      assert: (turns) => {
        const transforms = getWhereTransform(turns, 3);
        const selector = getSelector(transforms);

        if (!/where\s*\(/.test(selector)) {
          throw new Error(`expected a where() selector: ${transforms}`);
        }

        const cmp = /note\.velocity\s*>=?\s*(\d+)/.exec(transforms);

        if (!cmp) {
          throw new Error(`expected where(note.velocity > N): ${transforms}`);
        }

        const threshold = Number(cmp[1]);

        if (threshold < 80 || threshold > 100) {
          throw new Error(
            `velocity threshold ${threshold} should be ~90 (80-100): ${transforms}`,
          );
        }

        // Add 20: either velocity += 20, or velocity = note.velocity + 20.
        const additive =
          /velocity\s*\+=\s*20\b/.test(transforms) ||
          (/velocity\s*=/.test(transforms) &&
            /note\.velocity/.test(transforms) &&
            /\+\s*20\b/.test(transforms));

        if (!additive) {
          throw new Error(
            `expected velocity raised by 20 (relative): ${transforms}`,
          );
        }

        return true;
      },
    },

    { type: "response_contains", pattern: /notes|clip/i, turn: 1 },
    { type: "response_contains", pattern: /quiet|delet|remov/i, turn: 2 },
    {
      type: "response_contains",
      pattern: /loud|boost|accent|louder/i,
      turn: 3,
    },

    {
      type: "llm_judge",
      prompt:
        "The user asked to select notes by their velocity value (the quiet ones, then the loud ones), not by pitch or time position. A correct solution uses a where() predicate on note.velocity for each request — deleting notes below ~50, then raising notes above ~90 by 20. It should NOT read every note and hand-list individual positions or pitches.",
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 120_000 },
  ],
};
