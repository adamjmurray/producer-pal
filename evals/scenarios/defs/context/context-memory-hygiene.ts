// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios: does the model KEEP the memory collection clean?
 *
 * Both seed an entry that the user's next message makes obsolete. An index that
 * accumulates near-duplicates and stale facts costs context on every turn and
 * starts contradicting itself, so the skills teach two habits — reuse a name to
 * UPDATE rather than duplicate, and DELETE what's wrong. Neither had any
 * LLM-level coverage.
 *
 * The judge is ADVISORY here: the entry name and the action are tool-call
 * arguments, so the custom assertions already pin the outcome exactly. See
 * context-write-layers.ts for why an un-advisory judge misfires on these.
 */

import { type EvalScenario } from "../../types.ts";
import {
  CONTEXT_LIVE_SET,
  MSG_CONNECT,
  REQUIRES_MEMORY,
  TOOL_CONNECT,
  assertContextWrite,
  assertMemoryDeleted,
  assertNoContextWrite,
  seedContext,
} from "./context-scenario-helpers.ts";

const FAVORITE_SYNTH = "favorite-synth";
const JAMIE_COLLAB = "jamie-collab-deadline";

export const contextMemoryUpdateNotDuplicate: EvalScenario = {
  id: "context-memory-update-not-duplicate",
  description:
    "Reuses an existing memory name to update, instead of duplicating",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,
  // Judge is commentary, not a gate — see the file header.
  judgeAdvisory: true,
  requires: REQUIRES_MEMORY,

  ...seedContext({
    memories: [
      {
        name: FAVORITE_SYNTH,
        description:
          "The user's go-to synth for lead sounds — relevant when choosing or loading an instrument.",
        content: "Adam's go-to lead synth is Serum.",
      },
    ],
  }),

  messages: [
    MSG_CONNECT,
    "I've switched from Serum to Vital for all my lead sounds now — Serum isn't " +
      "even on my machine anymore.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // The superseding fact belongs in the entry that already covers it. Writing
    // a NEW name (e.g. "synth-preference") leaves the Serum entry behind, and
    // the index then asserts two contradictory things. Pinning `name` also
    // fails a run that updates the right entry AND spawns a duplicate alongside
    // it; `count: 1` rejects double-writes to the pinned name itself.
    assertContextWrite({
      scope: "memory",
      turn: 1,
      name: FAVORITE_SYNTH,
      count: 1,
    }),

    // The OTHER way to strand the Serum entry, and the one models actually
    // reach for: a go-to synth is a cross-project preference, and the layer
    // rules say preferences live in global context — which is empty, so it may
    // be written unasked. Follow that chain and you write "uses Vital" to
    // global while the memory index still says Serum, on every future connect.
    // An entry that already covers the fact overrides the layer rules: update
    // it where it lives. (Observed, verbatim, from a model's own reflection.)
    assertNoContextWrite({ scope: "global", turn: 1 }),

    {
      type: "llm_judge",
      prompt: `A memory named "favorite-synth" already said the user's go-to lead
synth is Serum, and the user just said they switched to Vital. Evaluate whether
the assistant UPDATED that existing entry (reusing the name "favorite-synth").
FAIL it for creating a second, contradictory memory under a new name, and FAIL
it for writing the new fact to global/project context while leaving the
favorite-synth memory still claiming Serum.`,
    },
  ],
};

export const contextMemoryDelete: EvalScenario = {
  id: "context-memory-delete",
  description: "Deletes a memory the user says is finished with",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,
  // Judge is commentary, not a gate — see the file header.
  judgeAdvisory: true,
  requires: REQUIRES_MEMORY,

  ...seedContext({
    memories: [
      {
        name: JAMIE_COLLAB,
        description:
          "Deadline and status for the collab track with Jamie — relevant when planning work.",
        content: "The collab track with Jamie is due 2026-03-01.",
      },
    ],
  }),

  messages: [
    MSG_CONNECT,
    "The Jamie collab is finished and released. You can forget about it.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Not "write an empty body" or "append (done)" — the entry should be gone.
    assertMemoryDeleted(JAMIE_COLLAB, 1),

    {
      type: "llm_judge",
      prompt: `A memory tracked a deadline for a collab that the user has now
finished. Evaluate whether the assistant DELETED that memory outright, rather
than rewriting it to say "done" or leaving it in place.`,
    },
  ],
};
