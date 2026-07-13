// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios: does the assistant get to know a NEW user — exactly once?
 *
 * Memory is invisible unless the assistant raises it, so a user who is never
 * asked never gets one. When global context is empty and no memories exist, the
 * next-step block that closes ppal-connect
 * (`src/mcp-server/helpers/connect/next-step-inject.ts`) tells the assistant to
 * invite the user to share their style, preferences, and goals.
 *
 * What they share goes to GLOBAL context, not memory — an always-on fact about
 * who they are belongs in an always-on layer — and it needs no confirmation
 * because that document is empty, so a write destroys nothing. Getting the
 * LAYER right is half of what these grade; the pull toward memory is strong,
 * since memory is the one layer the assistant may write freely.
 *
 * The offer must also be ONE-SHOT, and nothing tracks "already asked": sharing
 * fills global context, declining writes a memory, and EITHER flips the check
 * back to the plain next step. So these grade both directions, which is the
 * whole risk surface: an assistant that never asks leaves the feature
 * undiscovered, and one that asks every session is a nag. The unit tests
 * (`next-step-inject.test.ts`) already pin WHICH text gets injected; what only
 * an LLM can tell us is whether the model acts on it.
 *
 * The judge is the GATE here, not advisory: "did it ask?" and "did it drop the
 * subject?" are properties of the prose, and no tool call can pin them.
 */

import { type EvalScenario } from "../../types.ts";
import {
  CONTEXT_LIVE_SET,
  MSG_CONNECT,
  REQUIRES_MEMORY,
  TOOL_CONNECT,
  assertContextWrite,
  assertNoContextWrite,
  seedContext,
} from "./context-scenario-helpers.ts";

/** A prior decline, recorded as memory — what makes the offer one-shot. */
const DECLINED = "declined-personal-context";

export const contextOnboardingOffer: EvalScenario = {
  id: "context-onboarding-offer",
  description:
    "Invites a brand-new user to share their style, then saves it to global context",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,
  requires: REQUIRES_MEMORY,

  // A stranger: no global context, no memories.
  ...seedContext({}),

  messages: [
    MSG_CONNECT,
    "Sure — I make dark hypnotic techno around 138 BPM, mostly with Serum, and " +
      "I'm trying to finish an EP this year.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // GLOBAL, not memory. Style, preferences, and career-level goals should
    // always apply, and always-on is precisely what context is for — a model
    // that files them in memory has downgraded them to lazy-loaded facts it may
    // never load again. It's the tempting mistake, too: memory is the layer it
    // may write without asking, so the pull is toward the wrong answer unless
    // it understands that an EMPTY global document also needs no permission.
    assertContextWrite({ scope: "global", turn: 1 }),

    // ...and it must not hedge by writing both.
    assertNoContextWrite({ scope: "memory", turn: 1 }),

    {
      type: "llm_judge",
      prompt: `The user is brand new: the assistant has no stored context or
memories about them. Evaluate the assistant's FIRST reply (right after
connecting to Live). It should report the connection/Live Set overview AND
briefly invite the user to share their musical style, preferences, or goals,
mentioning that it can remember this across sessions. Pass if that invitation is
present and is brief and conversational. FAIL if it never invites them, or if it
interrogates them with a long list of questions instead of a light offer.`,
    },
  ],
};

export const contextOnboardingRecordsDecline: EvalScenario = {
  id: "context-onboarding-records-decline",
  description: "Records a declined get-to-know-you offer so it never re-asks",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,
  requires: REQUIRES_MEMORY,

  ...seedContext({}),

  messages: [
    MSG_CONNECT,
    "Nah, I'd rather not get into all that. Let's just get to work.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // The decline IS the state. Without a memory written here, the next connect
    // sees an empty index, decides this is a stranger, and asks all over again
    // — the nag this whole mechanism exists to prevent. The name is the model's
    // to choose, so it goes unpinned (teardown cleans up by diff).
    assertContextWrite({ scope: "memory", turn: 1 }),

    {
      type: "llm_judge",
      prompt: `The assistant offered to learn about the user's musical style,
and the user declined. Evaluate whether the assistant accepted the decline
gracefully — dropping the subject and moving on. FAIL if it argues, re-asks, or
keeps pitching the benefits of letting it remember things.`,
    },
  ],
};

export const contextOnboardingStaysQuiet: EvalScenario = {
  id: "context-onboarding-stays-quiet",
  description: "Does not re-ask a user who already declined",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,
  requires: REQUIRES_MEMORY,

  // The decline from a previous session. Any memory at all suppresses the
  // offer, so this fixture stands in for "we already asked once".
  ...seedContext({
    memories: [
      {
        name: DECLINED,
        description:
          "The user does not want to be asked about their musical background — do not offer again.",
        content:
          "Asked the user about their style, preferences, and goals; they declined. Never ask again.",
      },
    ],
  }),

  messages: [MSG_CONNECT],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    {
      type: "llm_judge",
      prompt: `A memory records that this user was already asked about their
musical background and declined. Evaluate the assistant's reply after connecting
to Live. It should report the connection/Live Set overview and wait for
instructions. FAIL if it asks the user about their musical style, preferences,
or goals again in any form.`,
    },
  ],
};
