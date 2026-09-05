// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Duplication scenarios:
 *   - `duplicate`: create content, duplicate a track, duplicate a clip to the
 *     arrangement (the `ppal-duplicate` tool).
 *   - `duplicateLoop`: double a MIDI clip in place via update-clip's
 *     `duplicateLoop` flag (a passthrough to Live's native Clip.duplicate_loop).
 */

import { parseToolResult } from "#evals/chat/mcp.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { getToolCalls } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import { callNamesArrangementPosition } from "../arrangement-helpers.ts";
import { assertNamesTarget } from "../path/path-scenario-helpers.ts";
import {
  clearClipSlots,
  clipStateAssertion,
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-scenario-helpers.ts";

const TOOL_DUPLICATE = "ppal-duplicate";

export const duplicate: EvalScenario = {
  id: "duplicate",
  description:
    "Create content, duplicate track, and duplicate clip to arrangement",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The checks below pin the outcome. The judge only adds commentary they
  // can't anticipate — hallucinations, misleading prose, extra steps.
  judgeAdvisory: true,

  messages: [
    "Connect to Ableton Live",
    "Create a 2-bar drum clip on the Drums track",
    "Duplicate the Drums track",
    "Duplicate the drum clip to bar 3 in the arrangement",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Clip creation
    { type: "tool_called", tool: "ppal-create-clip", turn: 1 },

    // Turn 2: Track duplication
    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 2 },

    // 2.2.0 renamed every tool's target arg to `id`. A duplicate with no target
    // at all used to pass here.
    assertNamesTarget({ turn: 2, tool: TOOL_DUPLICATE }),

    // Verify track duplication uses type: "track"
    {
      type: "custom",
      description: "ppal-duplicate uses type 'track'",
      assert: (turns) => {
        const calls = getToolCalls(turns, 2);
        const dupCall = calls.find((c) => c.name === TOOL_DUPLICATE);

        if (!dupCall) throw new Error("ppal-duplicate not found in turn 2");

        if (dupCall.args.type !== "track") {
          throw new Error(
            `Expected type 'track', got '${String(dupCall.args.type)}'`,
          );
        }

        return true;
      },
    },

    // Turn 3: Clip duplication
    { type: "tool_called", tool: TOOL_DUPLICATE, turn: 3 },
    assertNamesTarget({ turn: 3, tool: TOOL_DUPLICATE }),

    // Verify clip duplication uses type: "clip" and an arrangement position
    {
      type: "custom",
      description: "ppal-duplicate uses type 'clip' with a song position",
      assert: (turns) => {
        const calls = getToolCalls(turns, 3);
        const dupCall = calls.find((c) => c.name === TOOL_DUPLICATE);

        if (!dupCall) throw new Error("ppal-duplicate not found in turn 3");

        if (dupCall.args.type !== "clip") {
          throw new Error(
            `Expected type 'clip', got '${String(dupCall.args.type)}'`,
          );
        }

        if (!callNamesArrangementPosition(dupCall.args, "toPath")) {
          throw new Error(
            'No arrangement position (e.g. toPath "t0[5|1]") for clip duplication',
          );
        }

        return true;
      },
    },

    // Response checks
    { type: "response_contains", pattern: /drum/i, turn: 1 },
    { type: "response_contains", pattern: /duplicat/i, turn: 2 },
    { type: "response_contains", pattern: /duplicat/i, turn: 3 },

    // Token usage
    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 100_000,
    },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a 2-bar drum clip on the Drums track
2. Duplicated the Drums track
3. Duplicated the clip to bar 3 in the arrangement
4. Confirmed each step was completed`,
    },
  ],
};

/** Lead is track 3 in basic-midi-4-track — a melodic (non-drum) track. */
const LEAD_TRACK = 3;
const LOOP_SLOT = `${LEAD_TRACK}/0`;
const TOOL_CREATE_CLIP = "ppal-create-clip";
/** Two bars in 4/4, expressed in Ableton quarter-note beats (the read meter). */
const HALF_BEATS = 8;

/**
 * Assert update-clip doubled the clip in place via duplicateLoop: the model
 * passed `duplicateLoop: true`, the clip id is unchanged, and the reported note
 * count is exactly twice the count create-clip returned.
 * @returns A custom assertion
 */
function assertDoubledInPlace(): EvalAssertion {
  return {
    type: "custom",
    description:
      "duplicateLoop doubled the clip in place (same id, exactly 2x notes)",
    assert: (turns) => {
      const createCall = getToolCalls(turns, 1).find(
        (c) => c.name === TOOL_CREATE_CLIP,
      );
      const updateCall = getToolCalls(turns, 2).find(
        (c) => c.name === TOOL_UPDATE_CLIP,
      );

      if (createCall?.result == null) {
        throw new Error("create-clip result missing in turn 1");
      }

      if (updateCall == null) {
        throw new Error("update-clip not called in turn 2");
      }

      if (updateCall.args.duplicateLoop !== true) {
        throw new Error(
          `expected duplicateLoop: true, got ${JSON.stringify(updateCall.args.duplicateLoop)}`,
        );
      }

      if (updateCall.result == null) {
        throw new Error("update-clip result missing in turn 2");
      }

      const before = parseToolResult(createCall.result) as {
        id?: unknown;
        noteCount?: number;
      };
      const after = parseToolResult(updateCall.result) as {
        id?: unknown;
        noteCount?: number;
      };

      if (before.noteCount == null || after.noteCount == null) {
        throw new Error("note counts unavailable on create/update results");
      }

      if (String(after.id) !== String(before.id)) {
        throw new Error(
          `clip id changed (${String(before.id)} -> ${String(after.id)}) — should double in place`,
        );
      }

      if (after.noteCount !== before.noteCount * 2) {
        throw new Error(
          `expected exactly 2x notes (before ${before.noteCount}, after ${after.noteCount})`,
        );
      }

      return true;
    },
  };
}

/**
 * Read-back verdict: the doubled clip's second half (beats >= 8) mirrors its
 * first half (beats < 8) — same pitches at the same in-half offsets, same count.
 * @param events - Re-interpreted notes (start_time in Ableton quarter beats)
 * @returns True when the second half is a copy of the first
 */
function secondHalfMirrorsFirst(events: NoteEvent[]): boolean {
  const first = events.filter((n) => n.start_time < HALF_BEATS);
  const second = events.filter((n) => n.start_time >= HALF_BEATS);

  if (first.length === 0 || first.length !== second.length) return false;

  const firstKeys = new Set(first.map((n) => `${n.pitch}@${n.start_time}`));

  return second.every((n) =>
    firstKeys.has(`${n.pitch}@${n.start_time - HALF_BEATS}`),
  );
}

/**
 * Doubling a MIDI clip with update-clip's `duplicateLoop` (a passthrough to
 * Live's native Clip.duplicate_loop). The capable move is the single
 * `duplicateLoop: true` flag, NOT a manual `length: "4bar"` + `notes: "@..."`
 * rewrite (which also can't carry automation envelopes — duplicateLoop does, for
 * free). Grades, per the eval gate: the model reached for `duplicateLoop: true`;
 * the clip id is unchanged (in-place double); the post-double note count is
 * EXACTLY 2x; and the read-back clip's second half mirrors its first. Envelope
 * duplication is a free native bonus, NOT a test target (PP can't read
 * envelopes per the automation limitation).
 *
 * Requires Ableton (real device + LLM): `npm run build:debug` then
 * `./scripts/eval -m google/gemini-3.6-flash -t duplicate-loop`.
 * NOT yet validated vs Live.
 */
export const duplicateLoop: EvalScenario = {
  id: "duplicate-loop",
  description:
    "Double a MIDI clip with duplicateLoop (native Clip.duplicate_loop)",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  setup: (mcpClient) => clearClipSlots(mcpClient, [LOOP_SLOT]),

  messages: [
    MSG_CONNECT,
    "On the Lead track (track index 3), create a 2-bar clip in the first clip slot with these notes: C3 at bar 1 beat 1, E3 at bar 1 beat 3, G3 at bar 2 beat 1, B3 at bar 2 beat 3.",
    "Now double that clip's length to 4 bars, copying the existing notes into the new second half — this is Ableton's Duplicate Loop action.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    assertDoubledInPlace(),
    clipStateAssertion(LOOP_SLOT, "4/4", secondHalfMirrorsFirst),
    // Heavier than the notation scenarios: 3 turns each carrying the full
    // connect skills blob, plus the state assertion's extra read-clip. ~144k is
    // the validated baseline (2026-06-11, gemini-3.5-flash); target leaves a
    // little headroom so a real regression still trips it.
    { type: "token_usage", metric: "inputTokens", maxTokens: 160_000 },
  ],
};
