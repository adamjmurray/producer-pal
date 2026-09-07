// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The probe set for {@link ../probes/skill-recall-probe.ts}: one question per
 * piece of context we write, answerable ONLY from that piece.
 *
 * Three surfaces, because all three are ours to edit and all three are things
 * the model has to recall from: skill fragments, tool descriptions, and param
 * descriptions/schemas. Every probe runs against the full real context (skills
 * + published tool schemas), so a pass means the content survived assembly AND
 * reached the model where it currently sits.
 *
 * A probe is not a quality bar. It catches content LOSS — the failure a bad
 * `@include` order causes, invisible to a string check because the text is
 * still in the blob. A model can recall `legato(tol)` perfectly and still never
 * use it; that is what the eval suite is for.
 *
 * Writing a good probe: pick an answer that appears in exactly one place and is
 * cheap to match — a number, a token, a path. Avoid anything a capable model
 * could infer from the rest of the context, or it passes even when the source
 * is gone. Check a new probe against the negative control before trusting it.
 */

/** One recall question and what a passing answer must contain. */
export interface SkillRecallProbe {
  /** Which piece of context this aims at. */
  surface: "skill" | "tool" | "param";
  /**
   * What it aims at: a fragment name from `builtinFragments()`, a tool name, or
   * `tool.param`.
   */
  source: string;
  /** Which driver/mode includes it — probes run against the matching context. */
  tier: "standard" | "basic";
  /** Asked with the real skills + tool schemas in context. */
  question: string;
  /** Every pattern must match the reply for the probe to pass. */
  expect: RegExp[];
}

export const SKILL_RECALL_PROBES: SkillRecallProbe[] = [
  // --- skills, standard tier (standardDriver) ---
  {
    surface: "skill",
    source: "barbeat-standard",
    tier: "standard",
    question:
      "In this notation, write the position for bar 4 beat 2, then the position for bar 2 beat 4.",
    expect: [/4\|2/, /2\|4/],
  },

  {
    surface: "skill",
    source: "barbeat-standard-write",
    tier: "standard",
    question:
      "Fill one bar with four quarter notes on C3 using a repeat pattern rather than listing each beat. Give the notes string only.",
    expect: [/x4/],
  },

  {
    surface: "skill",
    source: "time-and-values",
    tier: "standard",
    question:
      "Is the note value `n/8` meter-relative or absolute? Answer in one word.",
    expect: [/absolute/i],
  },

  {
    surface: "skill",
    source: "transforms-core",
    tier: "standard",
    question:
      "Write one transforms line that sets velocity to 100 for pitch C1 only.",
    expect: [/C1\s*:/],
  },

  {
    surface: "skill",
    source: "transforms-editing",
    tier: "standard",
    question:
      "A clip already has notes. Delete everything in bar 3. Name the parameter and give its value.",
    expect: [/preTransforms/, /3\|\*/],
  },

  {
    surface: "skill",
    source: "transforms-expressions",
    tier: "standard",
    question: "Swing a clip by a medium amount. Give the transforms line only.",
    expect: [/swing\(/],
  },

  {
    surface: "skill",
    source: "transforms-generative",
    tier: "standard",
    question:
      "Add three more copies of a clip's notes, each an eighth note after the last. Give the transforms line only.",
    expect: [/repeat\(/],
  },

  {
    surface: "skill",
    source: "object-paths",
    tier: "standard",
    question:
      "The user says 'scene 3'. Which path addresses it? Answer with the path only.",
    expect: [/\bs2\b/],
  },

  {
    surface: "skill",
    source: "library",
    tier: "standard",
    question:
      "Which tool searches Live's browser library and the user's sample folder?",
    expect: [/ppal-library/],
  },

  {
    surface: "skill",
    source: "devices",
    tier: "standard",
    question:
      "Give the path of the first device inside the first chain of a rack that is the first device on the first track.",
    expect: [/t0\/d0\/c0\/d0/],
  },

  {
    surface: "skill",
    source: "devices-write",
    tier: "standard",
    question:
      "You are setting a device parameter. Which unit should the value you send use?",
    expect: [/unit/i],
  },

  {
    surface: "skill",
    source: "specialized-devices",
    tier: "standard",
    question:
      "How do you find out which function-call actions a native device exposes? Name the tool and the include value.",
    expect: [/read-device/i, /actions/],
  },

  {
    surface: "skill",
    source: "arrangement",
    tier: "standard",
    question:
      "An arrangement clip's time signature differs from the song's. Does `arrangementLength` resolve against the song meter or the clip meter? One word.",
    expect: [/song/i],
  },

  {
    surface: "skill",
    source: "arrangement-write",
    tier: "standard",
    question:
      "The user asks for a copy at the section they call 'Bridge'. Give the destination path.",
    expect: [/loc:/],
  },

  {
    surface: "skill",
    source: "working-with-live",
    tier: "standard",
    question: "What velocity number does `mf` correspond to? Number only.",
    expect: [/\b80\b/],
  },

  {
    surface: "skill",
    source: "context-standard",
    tier: "standard",
    question:
      "Which ppal-context scope keeps only an index in context, loading a full body on demand? One word.",
    expect: [/memory/i],
  },

  {
    surface: "skill",
    source: "getting-help",
    tier: "standard",
    question:
      "The user asks how to record automation in Live, which Producer Pal cannot drive. Give them the resource you would link.",
    expect: [/ableton\.com|producer-pal\.org/i],
  },

  // --- skills, basic tier (basicDriver, i.e. --small-model) ---
  {
    surface: "skill",
    source: "barbeat-basic",
    tier: "basic",
    question: "Which MIDI note number is C3? Number only.",
    expect: [/\b60\b/],
  },

  {
    surface: "skill",
    source: "barbeat-basic-write",
    tier: "basic",
    question:
      "Write a C major triad lasting one whole bar at bar 1. Notes string only.",
    expect: [/n\/1/, /1\|1/],
  },

  {
    surface: "skill",
    source: "object-paths-basic",
    tier: "basic",
    question: "The user says 'scene 3'. Which path addresses it? Path only.",
    expect: [/\bs2\b/],
  },

  {
    surface: "skill",
    source: "transforms-basic",
    tier: "basic",
    question:
      "A clip already has notes. Which parameter clears them before new notes merge in?",
    expect: [/preTransforms/],
  },

  {
    surface: "skill",
    source: "arrangement-basic",
    tier: "basic",
    question:
      "Give the path segment that appends a fresh take lane to track 3.",
    expect: [/l\+/],
  },

  {
    surface: "skill",
    source: "context-basic",
    tier: "basic",
    question:
      "Before writing to a ppal-context scope, what must you do to that same scope first? One word.",
    expect: [/read/i],
  },

  {
    surface: "skill",
    source: "getting-help-basic",
    tier: "basic",
    question:
      "Can Producer Pal detect the key or tempo of an audio clip? Yes or no.",
    expect: [/\bno\b|can'?t|cannot/i],
  },

  // --- tool + param descriptions (standard tier) ---
  // These aim at the schema surface, not the skills. They are the levers for
  // the findings where the skills already say the right thing and the model
  // does the wrong thing anyway — change the description, re-probe, then run
  // the canary to see whether behavior moved.
  {
    surface: "tool",
    source: "ppal-duplicate",
    tier: "standard",
    question:
      "Which ppal-duplicate parameter names where the copy should go? Parameter name only.",
    expect: [/toPath/],
  },

  {
    surface: "param",
    source: "ppal-update-live-set.tempo",
    tier: "standard",
    question:
      "What is the lowest tempo ppal-update-live-set will accept? Number only.",
    expect: [/\b20\b/],
  },

  {
    surface: "param",
    source: "ppal-update-device.force",
    tier: "standard",
    question:
      "When is ppal-update-device's `force` parameter meant to be used? One sentence.",
    expect: [/sample/i, /replac/i],
  },

  {
    surface: "param",
    source: "ppal-context.scope",
    tier: "standard",
    question: "List every value ppal-context's `scope` accepts.",
    expect: [/project/i, /global/i, /memory/i],
  },

  {
    surface: "param",
    source: "ppal-context.name",
    tier: "standard",
    question:
      "You are saving a fact that an existing memory entry already covers. What should you do with its name?",
    expect: [/reuse|same|existing/i],
  },
];
