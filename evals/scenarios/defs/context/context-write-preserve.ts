// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * When the model adds a fact to a user-owned layer, does the rest of the
 * document SURVIVE?
 *
 * `action:write` replaces the whole document — there is no append mode. So to
 * add one fact, the model must send back everything that was already there plus
 * the new line. It has what it needs: project and global context are injected
 * into its context on connect, so no read is required first.
 *
 * This is the severity question behind the confirm-before-writing failure. A
 * model that skips the confirmation but carries the document forward is merely
 * presumptuous. A model that skips the confirmation AND sends only the new fact
 * silently destroys everything the user had accumulated. This scenario seeds
 * NON-EMPTY documents — which the layer-routing scenarios deliberately do not —
 * and inspects the `content` the model actually sends. Both layers are exercised
 * in one run; the project write comes first, and carrying that document forward
 * does prime the global write that follows.
 *
 * No LLM judge: what survived the write is read straight off the `content`
 * argument, so the custom assertion pins it exactly.
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

export const contextWritePreserves: EvalScenario = {
  id: "context-write-preserves",
  description: "Adding a fact to project or global context keeps the rest",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,

  config: { projectContext: EXISTING_PROJECT },

  ...seedContext({ global: EXISTING_GLOBAL }),

  messages: [
    MSG_CONNECT,
    "One more thing about this track: the drop lands at bar 33, and I want the " +
      "bass sidechained hard to the kick. Save that with the project notes.",
    "Add this to my global preferences: I always want tracks named in lowercase, " +
      "in every project.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Both writes are explicitly asked for, so confirmation isn't in play —
    // this isolates the one question: did the existing document survive?
    assertContextWritePreserves({
      scope: "project",
      turn: "any",
      mustContain: ["deep house", "Burial", "16 bars"],
    }),
    assertContextWritePreserves({
      scope: "global",
      turn: "any",
      mustContain: ["Adam", "chord progressions"],
    }),
  ],
};
