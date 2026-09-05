// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Half-open range clears: deleting a region must NOT spill onto the note that
 * sits exactly on the region's exclusive boundary.
 *
 * Motivated by a real session (Gemma-4): asked to "delete the third measure",
 * the model wrote `3|1-4|1: v0`, whose inclusive end also deleted the note on
 * 4|1 (the first note of bar 4). The fix adds half-open selectors — the `N|*`
 * whole-bar wildcard and the `-<` exclusive-end marker — and the skills now
 * steer toward them. The scenario guards the user-visible OUTCOME (the
 * boundary note survives), not which syntax the model emits — a model that
 * writes the clean `3|*` / `3|1-<3|3` passes; one that overshoots fails.
 *
 * A `setup` hook builds a deterministic 4-bar clip (a C3 quarter on every beat)
 * so the boundary notes (bar-4 downbeat / bar-1 midpoint) are always present.
 */

import { argText } from "../../arg-text.ts";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getToolCalls } from "../../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../../types.ts";
import {
  assertNotesRead,
  clearClipSlots,
  MSG_CONNECT,
  readClipNotesFromTurn,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "../helpers/clip-scenario-helpers.ts";

const LIVE_SET = "basic-midi-4-track";
const SLOT = "0/0";
/** The same position as SLOT, in the path grammar the clip tools take. */
const SLOT_PATH = "t0/s0";
/** A C3 quarter on every beat of 4 bars — bar 3 is full and 4|1 is occupied. */
const TEST_NOTES = "n/4 C3 1|1,2,3,4 2|1,2,3,4 3|1,2,3,4 4|1,2,3,4";
/** Float tolerance for matching note start times (musical beats). */
const EPS = 1e-6;

/**
 * Rebuild the deterministic test clip in slot 0/0. Clears the slot first so a
 * run that inherits an already-open Live Set still starts clean.
 *
 * @param mcpClient - MCP client for tool calls
 */
async function setupRangeClip(mcpClient: Client): Promise<void> {
  await clearClipSlots(mcpClient, [SLOT]);
  await mcpClient.callTool({
    name: "ppal-create-clip",
    arguments: {
      path: SLOT_PATH,
      length: "4bar",
      timeSignature: "4/4",
      name: "range-bound-test",
      notes: TEST_NOTES,
    },
  });
}

/**
 * Whether a note start time falls in the half-open window [start, end).
 *
 * @param t - Note start time in musical beats
 * @param start - Inclusive window start
 * @param end - Exclusive window end (a note exactly here is OUTSIDE)
 * @returns True when start <= t < end
 */
function inWindow(t: number, start: number, end: number): boolean {
  return t >= start - EPS && t < end - EPS;
}

/**
 * Assert a half-open beat window [start, end) was cleared and EVERYTHING else
 * (notably the note at exactly `end`, the overshoot victim) survived unchanged.
 * Self-calibrating on the clip's meter via readClipNotesFromTurn.
 *
 * @param readTurn - Turn whose read captured the original notes
 * @param verifyTurn - Turn whose read captured the post-edit notes
 * @param windowOf - Maps beats-per-bar to the [start, end) window to clear
 * @param label - Assertion description
 * @returns A custom assertion
 */
function assertRegionCleared(
  readTurn: number,
  verifyTurn: number,
  windowOf: (beatsPerBar: number) => [number, number],
  label: string,
): EvalAssertion {
  return {
    type: "custom",
    description: label,
    assert: (turns) => {
      const before = readClipNotesFromTurn(turns, readTurn);
      const after = readClipNotesFromTurn(turns, verifyTurn);

      if (before == null || after == null) {
        throw new Error("could not read clip notes before/after the edit");
      }

      const [winStart, winEnd] = windowOf(before.beatsPerBar);

      const leftover = after.notes.find((n) =>
        inWindow(n.start_time, winStart, winEnd),
      );

      if (leftover) {
        throw new Error(
          `note at beat ${leftover.start_time.toFixed(2)} still present in the cleared window [${winStart}, ${winEnd})`,
        );
      }

      for (const n of before.notes) {
        if (inWindow(n.start_time, winStart, winEnd)) continue;

        const survived = after.notes.some(
          (m) =>
            m.pitch === n.pitch && Math.abs(m.start_time - n.start_time) < EPS,
        );

        if (!survived) {
          throw new Error(
            `note ${n.pitch}@${n.start_time.toFixed(2)} is OUTSIDE the cleared window but was deleted — range overshoot`,
          );
        }
      }

      const expected =
        before.notes.length -
        before.notes.filter((n) => inWindow(n.start_time, winStart, winEnd))
          .length;

      if (after.notes.length !== expected) {
        throw new Error(
          `expected ${expected} notes after clearing [${winStart}, ${winEnd}), got ${after.notes.length}`,
        );
      }

      return true;
    },
  };
}

/**
 * Pass-only assertion that records which clear syntax the model reached for, so
 * eval runs can compare wildcard/exclusive adoption against the overshooting
 * forms. Fails only if no update-clip edit happened at all.
 *
 * @param turn - Turn that performed the clear
 * @returns A custom assertion
 */
function recordClearSyntax(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `record clear syntax at turn ${turn}`,
    assert: (turns) => {
      const calls = getToolCalls(turns, turn).filter(
        (c) => c.name === TOOL_UPDATE_CLIP,
      );

      if (calls.length === 0) {
        throw new Error("no ppal-update-clip call to clear the region");
      }

      const sel = calls
        .map((c) => `${argText(c.args.preTransforms)} ${argText(c.args.notes)}`)
        .join(" | ");

      let syntax = "other";

      if (/\|\s*\*/.test(sel))
        syntax = "wildcard"; // N|*
      else if (/-\s*</.test(sel))
        syntax = "exclusive"; // 3|1-<...
      else if (/\d\|\d+\.\d+/.test(sel))
        syntax = "decimal-stop-short"; // 3|2.99
      else if (/\d\|\d+\s*-\s*\d\|\d+/.test(sel)) syntax = "inclusive-range"; // 3|1-4|1

      console.log(
        `    [clear-syntax@turn${turn}] ${syntax} — ${sel.slice(0, 80)}`,
      );

      return true;
    },
  };
}

/**
 * One scenario, two clears: a whole bar (bar 3, whose exclusive end is the
 * bar-4 downbeat) then a half bar (the first half of bar 1, whose exclusive end
 * is the beat-3 note). Both boundary notes must survive. The clears target
 * different bars so the second still has a full region to work on.
 */
export const rangeClearBoundaries: EvalScenario = {
  id: "range-clear-boundaries",
  description:
    "Clear a whole bar and a half bar without deleting the boundary note",
  kind: "capability",
  liveSet: LIVE_SET,
  setup: setupRangeClip,

  messages: [
    MSG_CONNECT,
    "Read the notes of the clip in the first track's first scene.",
    "Delete all the notes in the third measure.",
    "Read that clip's notes again so we can confirm.",
    "Now clear just the first half of the FIRST measure; leave the second half alone.",
    "Read that clip's notes one more time.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertNotesRead(1),

    // Whole bar: bar N starts at (N-1)*beatsPerBar, so bar 3 = [2*bpb, 3*bpb).
    // The note at 3*bpb (bar-4 downbeat) sits on the exclusive edge.
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    recordClearSyntax(2),
    assertRegionCleared(
      1,
      3,
      (bpb) => [2 * bpb, 3 * bpb],
      "bar 3 cleared, bar-4 downbeat (and all else) intact",
    ),

    // Half bar: [0, bpb/2). The midpoint note at bpb/2 (beat 3 in 4/4) sits on
    // the exclusive edge. Graded against the turn-3 read, not the original.
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 4 },
    recordClearSyntax(4),
    assertRegionCleared(
      3,
      5,
      (bpb) => [0, bpb / 2],
      "first half of bar 1 cleared, midpoint note (and all else) intact",
    ),

    { type: "token_usage", metric: "inputTokens", maxTokens: 200_000 },
  ],
};
