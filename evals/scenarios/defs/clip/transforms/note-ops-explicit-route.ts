// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Note-count edits where the prompt names the route: "use a transform", or
 * "rewrite the notes directly". The route is graded here (it gates), plus the
 * resulting notes. The plain-ask versions are in `note-ops-roll-and-merge.ts`,
 * where only the result gates.
 *
 * Requires Ableton (real device + LLM): `npm run build:debug` then
 * `./scripts/eval -m google/gemini-3.8-flash -t note-ops-split-with-transform -t note-ops-merge-with-transform -t note-ops-split-direct-notes`.
 */

import { type EvalScenario } from "../../../types.ts";
import { MSG_CONNECT } from "../helpers/clip-tool-constants.ts";
import { clearClipSlots } from "../helpers/clip-turn-readers.ts";
import {
  CREATE_THEN_UPDATE,
  READ_THEN_UPDATE,
  tokenBudget,
  usedTransform,
  wroteNotesDirectly,
} from "./helpers/note-ops-assertions.ts";
import {
  drumLanesMerged,
  heldNoteCut,
  LIVE_SET,
  SESSION_HELD,
  SPLIT_LIVE_SET,
} from "./helpers/note-ops-clips.ts";

const CREATE_HELD_NOTE =
  "On the Lead track (track index 3), create a 2-bar clip in the first clip slot containing a single note: C3 sustained for the entire 2 bars.";

export const noteOpsSplitWithTransform: EvalScenario = {
  id: "note-ops-split-with-transform",
  tags: ["transforms"],
  description: "Asked to use a transform: cut a held note with split()",
  kind: "capability",
  requires: { transforms: true },
  liveSet: SPLIT_LIVE_SET,
  setup: (mcpClient) => clearClipSlots(mcpClient, ["3/0"]),

  messages: [
    MSG_CONNECT,
    CREATE_HELD_NOTE,
    "Use a transform to cut that held note into separate notes at bar 1 beat 3 and bar 2 beat 1.",
  ],

  assertions: [
    ...CREATE_THEN_UPDATE,
    usedTransform(2, /split\(/, "split()"),
    heldNoteCut(1, SESSION_HELD),
    tokenBudget(2_500),
  ],
};

export const noteOpsMergeWithTransform: EvalScenario = {
  id: "note-ops-merge-with-transform",
  tags: ["transforms"],
  description: "Asked to use a transform: merge drum hits with merge()",
  kind: "capability",
  requires: { transforms: true },
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "Find the drum clip in the first scene and read its notes",
    "Use a transform to combine the repeated hits in each drum lane into a single sustained note per lane.",
  ],

  assertions: [
    ...READ_THEN_UPDATE,
    usedTransform(2, /merge\(/, "merge()"),
    drumLanesMerged(),
    tokenBudget(4_000),
  ],
};

export const noteOpsSplitDirectNotes: EvalScenario = {
  id: "note-ops-split-direct-notes",
  tags: ["transforms"],
  description:
    "Asked for a direct notes edit: cut a held note without a transform",
  kind: "capability",
  requires: { transforms: true },
  liveSet: SPLIT_LIVE_SET,
  setup: (mcpClient) => clearClipSlots(mcpClient, ["3/0"]),

  messages: [
    MSG_CONNECT,
    CREATE_HELD_NOTE,
    "Cut that held note into separate notes at bar 1 beat 3 and bar 2 beat 1. Rewrite the notes directly — don't use a transform.",
  ],

  assertions: [
    ...CREATE_THEN_UPDATE,
    wroteNotesDirectly(2),
    heldNoteCut(1, SESSION_HELD),
    tokenBudget(2_500),
  ],
};
