// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Note-count edits asked for in plain musical terms: roll each note, merge
 * repeated hits, echo notes, cut a held note. The OUTCOME gates — the clip is
 * read back and its notes must be what the ask means, however the model got
 * there. Whether it used the matching transform (ratchet/merge/repeat/split)
 * is reported as a signal only.
 *
 * The split scenario means the `split()` TRANSFORM (cut notes), not update-clip's
 * `split` PARAMETER (slice a clip in two); the read-back catches the wrong one.
 *
 * Requires Ableton (real device + LLM): `npm run build:debug` then
 * `./scripts/eval -m google/gemini-3.8-flash -t note-ops-ratchet-roll -t note-ops-merge -t note-ops-split -t note-ops-repeat`.
 */

import { asSignal } from "../../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../../types.ts";
import { assertNotesRead } from "../helpers/clip-note-assertions.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_CREATE_CLIP,
  TOOL_UPDATE_CLIP,
} from "../helpers/clip-tool-constants.ts";
import { clearClipSlots } from "../helpers/clip-turn-readers.ts";
import {
  ARRANGEMENT_HELD,
  drumLanesMerged,
  heldNoteCut,
  LIVE_SET,
  leadNotesRolled,
  notesEchoedAnEighthLater,
  SESSION_HELD,
  SPLIT_LIVE_SET,
} from "./helpers/note-ops-clips.ts";
import { usedTransform } from "./helpers/note-ops-assertions.ts";

/** Connect, read the clip's notes in turn 1, then edit it in turn 2. */
const READ_THEN_UPDATE: EvalAssertion[] = [
  { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
  assertNotesRead(1),
  { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
];

/** Connect, create the clip in turn 1, then edit it in turn 2. */
const CREATE_THEN_UPDATE: EvalAssertion[] = [
  { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
  { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
  { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
];

/**
 * Output-token ceiling for a note-op scenario.
 * @param maxTokens - The ceiling
 * @returns A token-usage assertion
 */
function tokenBudget(maxTokens: number): EvalAssertion {
  return { type: "token_usage", maxTokens };
}

export const noteOpsRatchetRoll: EvalScenario = {
  id: "note-ops-ratchet-roll",
  tags: ["transforms"],
  description: "Turn each note of a melody into a four-note roll",
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
    leadNotesRolled(),
    asSignal(usedTransform(2, /ratchet\(/, "ratchet()")),
    tokenBudget(2_500),
  ],
};

export const noteOpsMerge: EvalScenario = {
  id: "note-ops-merge",
  tags: ["transforms"],
  description: "Glue repeated same-pitch drum hits into one sustained note",
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
    drumLanesMerged(),
    asSignal(usedTransform(2, /merge\(/, "merge()")),
    tokenBudget(4_000),
  ],
};

export const noteOpsRepeat: EvalScenario = {
  id: "note-ops-repeat",
  tags: ["transforms"],
  description:
    "Echo notes an eighth later within the clip, without resizing it",
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
    notesEchoedAnEighthLater(1),
    asSignal(usedTransform(2, /repeat\(/, "repeat()")),
    tokenBudget(2_500),
  ],
};

export const noteOpsSplit: EvalScenario = {
  id: "note-ops-split",
  tags: ["transforms"],
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

  // The arrangement case runs FIRST, unprimed: it is the harder one (song time,
  // not clip time). The clip-relative case then checks the model doesn't
  // over-generalize and keep reaching for sync where it doesn't belong.
  assertions: [
    ...CREATE_THEN_UPDATE,
    heldNoteCut(1, ARRANGEMENT_HELD),
    asSignal(usedTransform(2, /split\([^)]*\bsync\b/, "split(..., sync)")),
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 3 },
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 4 },
    heldNoteCut(3, SESSION_HELD),
    asSignal(usedTransform(4, /split\(/, "split()")),
    tokenBudget(6_000),
  ],
};
