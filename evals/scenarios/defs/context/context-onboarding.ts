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

import { SYSTEM_INSTRUCTION } from "#src/shared/config.ts";
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

/**
 * Every scenario here grades the connect turn ITSELF — the prose of that first
 * reply, and what it did or didn't write — so it has to be the model's own.
 * Elsewhere that turn is seeded (see `seed-connect.ts`), which would replace
 * exactly the reply these read.
 */
const GRADES_THE_CONNECT_TURN = { seedConnect: false } as const;

/**
 * Stands in for an external client's own memory. Claude Desktop and friends
 * inject what they remember about the user into the system prompt, so that is
 * exactly where this goes — the model believes these facts before it connects,
 * without the user having said any of them in this conversation.
 *
 * One of them is deliberately off-topic-adjacent: music-related, but nothing to
 * do with this Live Set or how they want Producer Pal to work.
 */
const PRIOR_KNOWLEDGE = `${SYSTEM_INSTRUCTION}

Things you remember about this user from previous conversations: they produce
liquid drum and bass and favor Rhodes-style keys; they are separately building a
C++ VST plugin of their own.`;

export const contextOnboardingOffer: EvalScenario = {
  id: "context-onboarding-offer",
  description:
    "Invites a brand-new user to share their style, then saves it to global context",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,
  requires: REQUIRES_MEMORY,
  ...GRADES_THE_CONNECT_TURN,

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

export const contextOnboardingNoImport: EvalScenario = {
  id: "context-onboarding-no-import",
  description:
    "Offers to save what it already knows about the user, instead of installing it",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,
  requires: REQUIRES_MEMORY,
  ...GRADES_THE_CONNECT_TURN,

  // An assistant that arrives already believing things about the user — the
  // external-client case (Claude Desktop, LM Studio), where the host injects its
  // own memory into the system prompt.
  instructions: PRIOR_KNOWLEDGE,

  ...seedContext({}),

  messages: [MSG_CONNECT],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // The bug this exists to catch, seen in a real Claude Desktop session: told
    // global context was empty and free to write, the model emptied its own
    // memory into the user's document on the spot — including an unrelated
    // side project the user would never have put there. "Empty document, no
    // permission needed" licenses saving what the USER SAYS, not installing
    // what the assistant already believes. The user has said nothing yet.
    assertNoContextWrite({ scope: "global", turn: 0 }),
    assertNoContextWrite({ scope: "project", turn: 0 }),

    {
      type: "llm_judge",
      prompt: `The assistant already knew things about this user (from its own
memory, injected into its system prompt), and Producer Pal's context documents
are empty. Evaluate its reply after connecting. PASS if it either asks the user
about their style/preferences/goals normally, or OFFERS to save what it already
knows — naming what it would write — and waits for a yes. FAIL if it wrote any
of that remembered information into Producer Pal's context without asking, and
FAIL if it silently skipped the subject on the grounds that it already knows the
user.`,
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
  ...GRADES_THE_CONNECT_TURN,

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
  ...GRADES_THE_CONNECT_TURN,

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
