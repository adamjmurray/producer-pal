// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios: does the model FOLLOW what's already in its context layers?
 *
 * Each seeds a layer with a rule that has a musically observable consequence,
 * then asks for a clip and grades the clip — never the model's prose. Saying
 * "sure, F# minor!" and then writing C major fails, which is the point.
 */

import { type EvalScenario } from "../../types.ts";
import { clipStateAssertion } from "../clip/helpers/clip-scenario-helpers.ts";
import {
  CONTEXT_LIVE_SET,
  LEAD_SLOT,
  MSG_CONNECT,
  REQUIRES_MEMORY,
  TOOL_CONNECT,
  assertMemoryRead,
  assertNoMemoryRead,
  seedContext,
  type SeedMemory,
} from "./context-scenario-helpers.ts";

const TOOL_CREATE_CLIP = "ppal-create-clip";

/** Quarter beats in two 4/4 bars — the length ceiling the project context sets. */
const TWO_BARS = 8;

/**
 * The rules are deliberately NOT about key. The Live Set carries its own
 * key/scale (basic-midi-4-track reports A minor), and a model that trusts the
 * Set over an invented project key is behaving sensibly — grading that as a
 * failure would test nothing but our willingness to contradict Live. These two
 * rules are instead arbitrary house style: unobservable from the Set, and both
 * cut AGAINST what a model writes by default (a bassline naturally lands on
 * beat 1), so passing means the context was actually read and applied.
 */
const PROJECT_CONTEXT = [
  '# Project: "Undertow"',
  "",
  "- House style: every clip in this project starts with a rest. Never put a",
  "  note on beat 1.",
  "- Every clip in this set is exactly 2 bars long. Never write a longer one.",
].join("\n");

/** The parts that vary between the "seed a layer, grade the clip" scenarios. */
interface ContextFollowSpec {
  id: string;
  description: string;
  /** Seeding for the layer under test. */
  seed: Pick<EvalScenario, "setup" | "teardown">;
  /** Project context is the one layer seeded by plain config. */
  config?: EvalScenario["config"];
  /** The turn-1 request. */
  ask: string;
  /** Passes when the written clip obeys the seeded rule. */
  clipCheck: Parameters<typeof clipStateAssertion>[2];
  judgePrompt: string;
}

/**
 * Build a context-following scenario: seed a layer, ask for one clip on the
 * Lead track, grade the clip.
 *
 * @param spec - The varying parts
 * @returns The assembled scenario
 */
function contextFollowScenario(spec: ContextFollowSpec): EvalScenario {
  return {
    id: spec.id,
    description: spec.description,
    kind: "capability",
    liveSet: CONTEXT_LIVE_SET,
    reuseLiveSet: true,
    judgeAdvisory: true,
    ...(spec.config == null ? {} : { config: spec.config }),
    ...spec.seed,

    messages: [MSG_CONNECT, spec.ask],

    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
      clipStateAssertion(LEAD_SLOT, "4/4", spec.clipCheck),
      { type: "llm_judge", prompt: spec.judgePrompt },
    ],
  };
}

export const contextFollowProject: EvalScenario = contextFollowScenario({
  id: "context-follow-project",
  description: "Honors the house-style rules in project context",

  // resetConfig() reverts the project layer, so it needs no teardown.
  config: { projectContext: PROJECT_CONTEXT },
  seed: seedContext({ clearSlots: [LEAD_SLOT] }),

  ask: "Add a bassline to the Lead track in the first clip slot.",

  clipCheck: (events) =>
    events.length > 0 &&
    // The downbeat is silent: nothing starts at beat 1 of the clip.
    events.every((n) => n.start_time > 0.001) &&
    events.every((n) => n.start_time + n.duration <= TWO_BARS + 0.001),

  judgePrompt: `The project context said every clip in this project starts with a rest
(never a note on beat 1) and that clips are never longer than 2 bars. Evaluate
whether the assistant:
1. Left beat 1 of the clip empty
2. Kept the clip to 2 bars or fewer
3. Did so WITHOUT the user restating either rule — i.e. it applied the project
   context on its own`,
});

export const contextFollowGlobal: EvalScenario = contextFollowScenario({
  id: "context-follow-global",
  description: "Honors a cross-project rule pinned in global context",

  // A velocity ceiling BELOW the notation default (100) — following it takes a
  // deliberate act, so passing can't happen by writing notes the lazy way.
  seed: seedContext({
    global: [
      "# How I work",
      "",
      "- Mix discipline: I mix quiet. Never write a note with a velocity above",
      "  80, in any project, on any instrument.",
    ].join("\n"),
    clearSlots: [LEAD_SLOT],
  }),

  ask: "Create a 1-bar chord progression on the Lead track in the first clip slot.",

  clipCheck: (events) =>
    events.length > 0 && events.every((n) => n.velocity <= 80),

  judgePrompt: `Global context said to never write a note velocity above 80.
Evaluate whether the assistant wrote the requested chord progression with every
velocity at or below 80, without being reminded.`,
});

/**
 * Three plausible memories, only one of which bears on writing a bass part. The
 * decoys matter: with a single entry, "read the only memory" is indistinguishable
 * from "chose the right memory". The model sees just names + descriptions in the
 * index and must decide from those alone that a body is worth loading.
 */
const MEMORIES: SeedMemory[] = [
  {
    name: "studio-hardware",
    description:
      "The user's controllers and audio interface — relevant when advising on hardware workflow or MIDI mapping.",
    content:
      "Adam plays in on a Push 3 and monitors through a UAD Apollo Twin.",
  },
  {
    name: "bassline-signature",
    description:
      "The user's signature bassline formula — read this before writing ANY bass part.",
    content:
      "Adam's bass parts are ALWAYS straight offbeat 8th notes (the 'and' of " +
      "every beat, never the downbeat), at velocity exactly 110.",
  },
  {
    name: "mixing-targets",
    description:
      "Loudness and bus level targets — relevant when mixing or setting track levels.",
    content: "Master bus peaks at -6 dBFS; Adam masters to -9 LUFS integrated.",
  },
];

/**
 * Whether a note lands on an offbeat 8th — halfway through a quarter beat.
 *
 * @param startTime - Note start in Ableton quarter beats
 * @returns True when the note sits on the "and" of a beat
 */
function isOffbeat8th(startTime: number): boolean {
  return Math.abs((startTime % 1) - 0.5) < 0.01;
}

export const contextMemoryRecall: EvalScenario = {
  id: "context-memory-recall",
  description: "Loads the one relevant memory by name, then applies its rule",
  kind: "capability",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,
  judgeAdvisory: true,
  requires: REQUIRES_MEMORY,

  ...seedContext({ memories: MEMORIES, clearSlots: [LEAD_SLOT] }),

  messages: [
    MSG_CONNECT,
    "Write me a 1-bar bassline on the Lead track in the first clip slot.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // The lookup itself: picked the right entry out of three, from its
    // description alone.
    assertMemoryRead("bassline-signature", 1),

    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },

    // And actually APPLIED the body it loaded. Velocity 110 and all-offbeat
    // placement are both unusual enough that neither happens by accident.
    clipStateAssertion(
      LEAD_SLOT,
      "4/4",
      (events) =>
        events.length > 0 &&
        events.every((n) => n.velocity === 110) &&
        events.every((n) => isOffbeat8th(n.start_time)),
    ),

    {
      type: "llm_judge",
      prompt: `A memory named "bassline-signature" said the user's bass parts are
always offbeat 8th notes at velocity 110. Evaluate whether the assistant:
1. Loaded that memory before writing (rather than guessing, or loading the
   unrelated "studio-hardware" / "mixing-targets" entries)
2. Wrote a bassline that is entirely offbeat 8ths at velocity 110`,
    },
  ],
};

export const contextMemoryNoSpuriousRecall: EvalScenario = {
  id: "context-memory-no-spurious-recall",
  description: "Leaves irrelevant memory bodies unloaded",
  kind: "regression",
  liveSet: CONTEXT_LIVE_SET,
  reuseLiveSet: true,
  requires: REQUIRES_MEMORY,

  ...seedContext({ memories: MEMORIES }),

  messages: [
    MSG_CONNECT,
    "What's the tempo of this Live Set, and how many tracks does it have?",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Nothing in the question touches bass, hardware, or mixing. A model that
    // loads bodies "just in case" defeats lazy loading and burns the context
    // window every turn — the exact cost the index exists to avoid.
    assertNoMemoryRead("any"),
  ],
};
