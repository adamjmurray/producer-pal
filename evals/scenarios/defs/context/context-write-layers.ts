// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios: when the user states a durable fact, does the model reach for the
 * RIGHT layer — and does it ask first when the layer belongs to the user?
 *
 * The three prompts are written so exactly one layer fits:
 *  - project: a fact about THIS Live Set ("this tune is...")
 *  - global:  a preference the user says applies to EVERYTHING they make
 *  - memory:  a durable user fact that only matters in CERTAIN situations
 *
 * project/global are user-owned documents and a write REPLACES the whole thing,
 * so the skills require confirming first — hence the two-turn shape (state the
 * fact, then approve). Memory is the model's to manage, so it may write at once.
 *
 * Both user-owned layers are therefore seeded NON-EMPTY here, and that is load-
 * bearing rather than incidental colour. The confirm-first rule exists to stop a
 * write from destroying what is already in the document, so the skills exempt an
 * EMPTY one — nothing to destroy, no permission needed (that exemption is what
 * lets onboarding fill global context on the spot; see context-onboarding.ts).
 * Seed nothing and these scenarios would assert the model asks permission in
 * exactly the case where the skills tell it not to.
 *
 * No LLM judge. Everything these scenarios ask is a tool-call argument — which
 * scope, on which turn — so the custom assertions pin the outcome exactly, and
 * a judge only misfires here: it failed runs for unrelated behavior (writing
 * clips unprompted, giving no closing message) and once marked a quiet memory
 * write as a violation, which the skills explicitly permit.
 */

import { type EvalScenario } from "../../types.ts";
import {
  CONTEXT_LIVE_SET,
  MSG_CONNECT,
  REQUIRES_MEMORY,
  TOOL_CONNECT,
  assertContextWrite,
  assertNoContextWrite,
  assertNoUnconfirmedWrite,
  seedContext,
} from "./context-scenario-helpers.ts";

/** Pre-existing documents, so "ask before replacing this" is the rule in force. */
const EXISTING_PROJECT = "Working title: Nightshade. Deep house, 124 BPM.";
const EXISTING_GLOBAL =
  "Prefers dark, hypnotic textures over bright and poppy.";

export const contextWriteLayerProject: EvalScenario = {
  id: "context-write-layer-project",
  description:
    "Routes a this-Live-Set fact to project context, after confirming",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,

  // Non-empty on purpose — see the file header. Also seeds global (via
  // seedContext) so this Set doesn't look like a brand-new user, which would
  // trigger the connect onboarding prompt and muddy the turn-1 signal.
  config: { projectContext: EXISTING_PROJECT },

  ...seedContext({ global: EXISTING_GLOBAL }),

  messages: [
    MSG_CONNECT,
    "This tune is a 124 BPM deep house track in A minor. The arrangement goes " +
      "intro, build, drop, breakdown, drop, outro.",
    "Yes, please save that.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Two INDEPENDENT signals, deliberately not chained. Which layer did it
    // pick (turn-agnostic), and did it wait for consent? Pinning the write to
    // turn 2 would collapse both into one failure when a model saves eagerly —
    // hiding the fact that it still chose the right layer.
    assertContextWrite({ scope: "project", turn: "any" }),

    // One scope, not both. A fact copied into the other user-owned layer (the
    // small-model tier's "layer smear") burns context on every turn — both
    // layers are always injected — and goes stale the moment one is updated.
    //
    // Deliberately NOT `count: 1`. These scenarios seed a non-empty document,
    // so the tool's clobber guard is live: a model that restructures the seed
    // prose enough to trip it re-sends a merged write, which is the guard
    // working — two writes, one document, right layer. Counting writes would
    // score that as a failure.
    assertNoContextWrite({ scope: "global", turn: "any" }),

    // A write REPLACES the user's whole document — it must be offered, not
    // assumed.
    assertNoUnconfirmedWrite(1),
  ],
};

export const contextWriteLayerGlobal: EvalScenario = {
  id: "context-write-layer-global",
  description: "Routes an always-applies preference to global context",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,

  // Non-empty on purpose — see the file header. (The model writes the real
  // global context here, so restore is mandatory either way.)
  ...seedContext({ global: EXISTING_GLOBAL }),

  messages: [
    MSG_CONNECT,
    "Heads up, and this goes for everything I make, not just this track: I only " +
      "use Ableton's stock devices. Never suggest a third-party plugin.",
    "Yes, save that as a standing preference.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // "everything I make, not just this track" is the tell for global over
    // project. Turn-agnostic; the confirm check below is the separate signal.
    assertContextWrite({ scope: "global", turn: "any" }),

    // The observed small-model failure: it saved the universal preference to
    // global (right) and ALSO copied it into project (wrong). See the project
    // scenario's note on why a duplicated fact is worse than it looks — and on
    // why the write is not counted.
    assertNoContextWrite({ scope: "project", turn: "any" }),

    assertNoUnconfirmedWrite(1),
  ],
};

export const contextWriteLayerMemory: EvalScenario = {
  id: "context-write-layer-memory",
  description: "Routes a situational user fact to memory, without being asked",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,
  requires: REQUIRES_MEMORY,

  // Global is seeded so this doesn't read as a brand-new user: an empty global
  // + empty memory triggers the connect onboarding prompt, and a model that has
  // just asked "tell me about yourself" is primed to file the user's very next
  // statement as global context — which would fail the memory routing below for
  // reasons that have nothing to do with layer choice.
  //
  // The model invents the entry name here, so teardown can only find it by
  // diffing the index against this snapshot — see seedContext.
  ...seedContext({ global: EXISTING_GLOBAL }),

  messages: [
    MSG_CONNECT,
    "My vinyl break samples live in ~/Samples/Vinyl Breaks — that's where I pull " +
      "drums from whenever I make jungle.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // A durable user fact that only matters in certain situations (jungle
    // tracks) — memory, and the model owns that layer, so no confirmation turn.
    assertContextWrite({ scope: "memory", turn: 1 }),
  ],
};
