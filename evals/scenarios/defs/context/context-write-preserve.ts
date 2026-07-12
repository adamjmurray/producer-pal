// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios: when the model adds a fact to a user-owned layer, does the rest of
 * the document SURVIVE?
 *
 * `action:write` replaces the whole document — there is no append mode. So to
 * add one fact, the model must send back everything that was already there plus
 * the new line. It has what it needs: project and global context are injected
 * into its context on connect, so no read is required first.
 *
 * This is the severity question behind the confirm-before-writing failure. A
 * model that skips the confirmation but carries the document forward is merely
 * presumptuous. A model that skips the confirmation AND sends only the new fact
 * silently destroys everything the user had accumulated. These scenarios seed a
 * NON-EMPTY document — which the layer-routing scenarios deliberately do not —
 * and inspect the `content` the model actually sends.
 */

import { type EvalScenario } from "../../types.ts";
import {
  CONTEXT_LIVE_SET,
  MSG_CONNECT,
  TOOL_CONNECT,
  assertContextWritePreserves,
  seedContext,
} from "./context-scenario-helpers.ts";

/** Pre-existing project document. The model must carry these facts forward. */
const EXISTING_PROJECT = [
  '# Project: "Undertow"',
  "",
  "- Genre: deep house, 124 BPM.",
  "- Reference track: Burial - Archangel.",
  "- The intro is 16 bars of pads before any drums come in.",
].join("\n");

/** Pre-existing global document. */
const EXISTING_GLOBAL = [
  "# How I work",
  "",
  "- Call me Adam.",
  "- I like strong chord progressions rooted in western music theory.",
].join("\n");

export const contextWritePreservesProject: EvalScenario = {
  id: "context-write-preserves-project",
  description: "Adding a project fact keeps the rest of the document",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,

  config: { memoryContent: EXISTING_PROJECT },

  ...seedContext({}),

  messages: [
    MSG_CONNECT,
    "One more thing about this track: the drop lands at bar 33, and I want the " +
      "bass sidechained hard to the kick. Save that with the project notes.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // The write is explicitly asked for here, so confirmation isn't in play —
    // this isolates the one question: did the existing document survive?
    assertContextWritePreserves({
      scope: "project",
      turn: "any",
      mustContain: ["deep house", "Burial", "16 bars"],
    }),

    {
      type: "llm_judge",
      prompt: `The project context already recorded the genre (deep house, 124 BPM),
a reference track (Burial - Archangel), and a 16-bar pad intro. The user asked to
add a new fact (drop at bar 33, sidechained bass). Since action:write REPLACES the
whole document, evaluate whether the assistant wrote back the existing facts ALONG
WITH the new one, rather than replacing the document with only the new fact.`,
    },
  ],
};

export const contextWritePreservesGlobal: EvalScenario = {
  id: "context-write-preserves-global",
  description: "Adding a global preference keeps the rest of the document",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,

  ...seedContext({ global: EXISTING_GLOBAL }),

  messages: [
    MSG_CONNECT,
    "Add this to my global preferences: I always want tracks named in lowercase, " +
      "in every project.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    assertContextWritePreserves({
      scope: "global",
      turn: "any",
      mustContain: ["Adam", "chord progressions"],
    }),

    {
      type: "llm_judge",
      prompt: `The global context already said to call the user Adam and that they
like strong chord progressions. The user asked to ADD a naming preference. Since
action:write REPLACES the whole document, evaluate whether the assistant preserved
the existing preferences alongside the new one, rather than wiping them.`,
    },
  ],
};
