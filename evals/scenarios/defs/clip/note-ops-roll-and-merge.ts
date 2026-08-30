// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Note-count transform idioms: does the model reach for ratchet()/repeat()/
 * split()/merge() — the statement-level note-count operations — rather than
 * hand-rewriting the clip note by note?
 *
 * Each grades the IDIOM (the transform string the model emitted) plus the
 * direction of the note-count change read back from the update-clip result:
 *   - ratchet: a roll should ADD notes (each note → several)
 *   - repeat:  echoing notes within the clip should ADD notes (no resize)
 *   - split:   cutting a note at explicit positions should ADD notes
 *   - merge:   gluing repeated same-pitch notes should REMOVE notes
 * The deterministic idiom + count-direction check is the whole grade — no LLM
 * judge.
 *
 * The split scenario steers firmly to the `split()` TRANSFORM (subdivide notes),
 * not update-clip's `split` PARAMETER (slice a clip into two clips) — same word,
 * different op. The grade reads the `transforms` arg, so a clip-level `split`
 * param fails the assertion.
 *
 * Requires Ableton (real device + LLM): `npm run build:debug` then
 * `./scripts/eval -m google/gemini-3.6-flash -t note-ops-ratchet-roll -t note-ops-merge -t note-ops-split -t note-ops-repeat`.
 * Validated vs Live 2026-06-06: ratchet/merge PASS 4/4 — the model reached for
 * the exact idioms (`ratchet(4)` grew 12→48 notes; `merge()` collapsed to one
 * note per drum pitch).
 * Validated vs Live 2026-06-07 (then two scenarios): split/split-sync PASS 4/4 — the model emitted
 * `split(1|3, 2|1)` clip-relative and `split(7|1, 8|1, sync)` for an arrangement
 * clip starting at bar 5 (one held note → 3 pieces, proving the sync coordinate
 * math end-to-end).
 * Validated vs Live 2026-06-11: repeat PASS 4/4 — the model reached for
 * `repeat(n/8)` (offset-first; copies defaults to 1), 4 notes → 8, clip length
 * unchanged.
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
  clearClipSlots,
  getTransforms,
  MSG_CONNECT,
  readClipNotesFromTurn,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-scenario-helpers.ts";

const LIVE_SET = "basic-with-drum-and-lead-clips";
/** 4-track Live Set used by the split scenarios (Lead + Bass tracks). */
const SPLIT_LIVE_SET = "basic-midi-4-track";
/** create-clip tool name (split scenarios create the clip they then cut). */
const TOOL_CREATE_CLIP = "ppal-create-clip";

/**
 * Read the resulting noteCount from a ppal-update-clip call's result.
 *
 * Scans BACKWARD for the last call that actually reported a count. A model that
 * gets a transform wrong is told to fix it and call again — and these scenarios
 * provoke exactly that, since the parser's targeted errors are what teach the
 * op's spelling. Reading the first call grades the discarded attempt, whose
 * warn-and-skip result carries no `noteCount` at all.
 *
 * @param turns - All turn results
 * @param turn - Turn index containing the update-clip call
 * @returns The post-update note count, or null when no call reported one
 */
function updateNoteCount(turns: EvalTurnResult[], turn: number): number | null {
  const calls = getToolCalls(turns, turn).filter(
    (c) => c.name === TOOL_UPDATE_CLIP,
  );

  for (const call of calls.toReversed()) {
    if (call.result == null) continue;

    const parsed = parseToolResult(call.result) as { noteCount?: number };

    if (parsed.noteCount != null) return parsed.noteCount;
  }

  return null;
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

/**
 * Assert a `split()` transform ran and grew the note count. No prior read turn:
 * the split scenarios create a single-note clip, so any real cut grows the count
 * past 1. With `sync`, also require the trailing `sync` keyword — and since the
 * positions are arrangement-absolute, the count only grows when the model both
 * synced AND used arrangement-timeline positions (a clip-relative number with
 * `sync` lands outside the note and cuts nothing), so this one assertion checks
 * the idiom and the end-to-end coordinate math at once.
 * @param editTurn - Turn that applied the split transform
 * @param opts - Assertion options
 * @param opts.sync - When true, also require the trailing `sync` keyword
 * @returns A custom assertion
 */
function assertSplitGrew(
  editTurn: number,
  opts: { sync?: boolean } = {},
): EvalAssertion {
  return {
    type: "custom",
    description: opts.sync
      ? "used split(..., sync) and the note count grew"
      : "used split(...) and the note count grew",
    assert: (turns) => {
      const transforms = getTransforms(turns, editTurn, TOOL_UPDATE_CLIP);

      if (!/split\(/.test(transforms)) {
        throw new Error(
          `expected a split() note op: ${transforms.slice(0, 120)}`,
        );
      }

      if (opts.sync && !/split\([^)]*\bsync\b/.test(transforms)) {
        throw new Error(
          `expected split() with the sync keyword: ${transforms.slice(0, 120)}`,
        );
      }

      const after = updateNoteCount(turns, editTurn);

      if (after == null) {
        throw new Error("could not read the post-update note count");
      }

      if (after <= 1) {
        throw new Error(
          `split should grow the single note into pieces (after ${after})`,
        );
      }

      return true;
    },
  };
}

/**
 * Read the noteCount a ppal-create-clip call reported (the "before" count for
 * the repeat scenario, which has no separate read turn).
 * @param turns - All turn results
 * @param turn - Turn index containing the create-clip call
 * @returns The created note count, or null when unavailable
 */
function createdNoteCount(
  turns: EvalTurnResult[],
  turn: number,
): number | null {
  const call = getToolCalls(turns, turn).find(
    (c) => c.name === TOOL_CREATE_CLIP,
  );

  if (call?.result == null) return null;

  const parsed = parseToolResult(call.result) as { noteCount?: number };

  return parsed.noteCount ?? null;
}

/**
 * Assert a `repeat()` transform ran and grew the note count WITHOUT resizing the
 * clip — i.e. the model echoed notes via the transform, not via update-clip's
 * `duplicateLoop` (which doubles clip length) or a hand-listed rewrite.
 * @param createTurn - Turn that created the clip (establishes the before-count)
 * @param editTurn - Turn that applied the repeat transform
 * @returns A custom assertion
 */
function assertRepeatGrew(createTurn: number, editTurn: number): EvalAssertion {
  return {
    type: "custom",
    description:
      "used repeat(offset, copies) and the note count grew (no resize)",
    assert: (turns) => {
      const editCall = getToolCalls(turns, editTurn).find(
        (c) => c.name === TOOL_UPDATE_CLIP,
      );
      const transforms = getTransforms(turns, editTurn, TOOL_UPDATE_CLIP);

      if (!/repeat\(/.test(transforms)) {
        throw new Error(
          `expected a repeat() note op: ${transforms.slice(0, 120)}`,
        );
      }

      // duplicateLoop would double the clip length — the wrong tool for an
      // in-place echo. Fail if the model reached for it instead.
      if (editCall?.args.duplicateLoop === true) {
        throw new Error(
          "used duplicateLoop (resizes the clip) instead of repeat",
        );
      }

      const before = createdNoteCount(turns, createTurn);
      const after = updateNoteCount(turns, editTurn);

      if (before == null || after == null) {
        throw new Error("could not read the before/after note counts");
      }

      if (after <= before) {
        throw new Error(
          `repeat should grow the note count (before ${before}, after ${after})`,
        );
      }

      return true;
    },
  };
}

/** Connect, read the clip's notes in turn 1, then transform it in turn 2. */
const READ_THEN_UPDATE: EvalAssertion[] = [
  { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
  assertNotesRead(1),
  { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
];

/** Connect, create the clip in turn 1, then transform it in turn 2. */
const CREATE_THEN_UPDATE: EvalAssertion[] = [
  { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
  { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
  { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
];

/**
 * Input-token ceiling for a note-op scenario.
 * @param maxTokens - The ceiling
 * @returns A token-usage assertion
 */
function tokenBudget(maxTokens: number): EvalAssertion {
  return { type: "token_usage", metric: "inputTokens", maxTokens };
}

export const noteOpsRatchetRoll: EvalScenario = {
  id: "note-ops-ratchet-roll",
  description: "Turn each note of a melody into a roll via ratchet()",
  kind: "capability",
  requires: { transforms: true },
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "Find the lead melody clip in the first scene and read its notes",
    "Turn each note of that melody into a four-note roll",
  ],

  assertions: [
    ...READ_THEN_UPDATE,
    assertNoteOp(1, 2, /ratchet\(/, "grow"),
    tokenBudget(100_000),
  ],
};

export const noteOpsMerge: EvalScenario = {
  id: "note-ops-merge",
  description:
    "Glue repeated same-pitch drum hits into sustained notes via merge()",
  kind: "capability",
  requires: { transforms: true },
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "Find the drum clip in the first scene and read its notes",
    "Each drum lane has many separate repeated hits. Combine the repeated hits in each lane into a single sustained note per lane.",
  ],

  assertions: [
    ...READ_THEN_UPDATE,
    assertNoteOp(1, 2, /merge\(/, "shrink"),
    tokenBudget(100_000),
  ],
};

export const noteOpsRepeat: EvalScenario = {
  id: "note-ops-repeat",
  description:
    "Echo notes within the clip via repeat() — adds notes, no resize",
  kind: "capability",
  requires: { transforms: true },
  liveSet: SPLIT_LIVE_SET,
  setup: (mcpClient) => clearClipSlots(mcpClient, ["3/0"]),

  messages: [
    MSG_CONNECT,
    "On the Lead track (track index 3), create a 2-bar clip in the first clip slot with four quarter notes in bar 1: C3, E3, G3, B3 on beats 1, 2, 3, and 4.",
    "Now add a delayed echo: copy every note an eighth note later at the same pitch, layered on top of the originals. Keep the clip the same length — don't make it longer.",
  ],

  assertions: [
    ...CREATE_THEN_UPDATE,
    assertRepeatGrew(1, 2),
    // Three turns (connect + create + update), each carrying the full skills
    // blob; ~122k is the validated baseline (2026-06-11, gemini-3.5-flash).
    // Target leaves headroom so a real regression still trips it.
    tokenBudget(140_000),
  ],
};

export const noteOpsSplit: EvalScenario = {
  id: "note-ops-split",
  description:
    "Cut held notes at arrangement-timeline positions, then at clip positions",
  kind: "capability",
  requires: { transforms: true },
  liveSet: SPLIT_LIVE_SET,
  setup: (mcpClient) => clearClipSlots(mcpClient, ["3/0"]),

  messages: [
    MSG_CONNECT,
    "On the Bass track, create a 4-bar clip in the arrangement starting at bar 5, containing a single note: C2 held for the entire 4 bars.",
    "Break that one held note into separate notes, cutting it at arrangement bar 7 and arrangement bar 8 — use the arrangement timeline positions, not positions relative to the clip's own start.",
    "Now on the Lead track (track index 3), create a 2-bar clip in the first clip slot containing a single note: C3 sustained for the entire 2 bars.",
    "Break that one held note into separate notes by cutting it at bar 1 beat 3 and bar 2 beat 1.",
  ],

  // The sync case runs FIRST, unprimed: it is the harder one (song time, not
  // clip time). The clip-relative case then checks the model doesn't
  // over-generalize and keep reaching for sync where it doesn't belong.
  assertions: [
    ...CREATE_THEN_UPDATE,
    assertSplitGrew(2, { sync: true }),
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 3 },
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 4 },
    assertSplitGrew(4),
    tokenBudget(220_000),
  ],
};
