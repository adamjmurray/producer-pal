// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Which tools each skills fragment teaches. Disabling a tool used to leave its
// guidance in the blob — a user who turned ppal-library off still paid ~750
// tokens learning to search a library the model could not reach. This table is
// what lets assembly drop that.
//
// The rule runs in ONE direction only. Tool disabled ⇒ drop its fragments: safe,
// automatic, no judgment. The converse (tool enabled ⇒ include its fragments) is
// merely a heuristic — anything that can edit a clip would otherwise be handed
// every waveform and ratchet — so it is preset-authoring guidance, not runtime
// logic, and does not live here.
//
// Gates are ANY-OF: a fragment ships when at least one of its tools is live.
// Most fragments serve two or three (the notation head serves five), so a single
// owning tool per fragment was never the shape of this.
//
// The table is keyed by FRAGMENT name rather than declared on SkillSlotDef
// because a gate is a runtime concern while a slot is an authoring one, and the
// two sets differ: `code-transforms` is a real fragment with no override slot.
// A test asserts every fragment has an entry, so adding one forces the decision.

// The two clip writers, named because three separate gates reach for them.
const CREATE_CLIP = "ppal-create-clip";
const UPDATE_CLIP = "ppal-update-clip";

/**
 * Tools that carry clip `notes` in either direction — the three read tools all
 * have a `notes` include, and create/update-clip take notes as input. Any one of
 * them makes the notation head load-bearing.
 */
const NOTE_TOOLS = [
  "ppal-read-clip",
  CREATE_CLIP,
  UPDATE_CLIP,
  "ppal-read-track",
  "ppal-read-scene",
] as const;

/** The tools whose schemas accept `transforms` / `preTransforms`. */
const TRANSFORM_TOOLS = [CREATE_CLIP, UPDATE_CLIP, "ppal-duplicate"] as const;

/** The three device tools; the path grammar and build recipes serve all of them. */
const DEVICE_TOOLS = [
  "ppal-read-device",
  "ppal-create-device",
  "ppal-update-device",
] as const;

/**
 * A fragment's condition for shipping: the tools it teaches (any-of), or one of
 * two reasons no toolset can decide it.
 *
 * - `"always"` — needed regardless of toolset. `time-and-values` defines the
 *   units every other fragment's numbers are in; `working-with-live` is
 *   music-making judgment that outlives any one tool.
 * - `"conversation-only"` — maps to no tool at all, because its subject is what
 *   to TELL someone when a tool won't do. Tool gating can never drop it; the
 *   audience axis below is what does (a subagent worker has no user to explain
 *   anything to).
 */
export type FragmentGate = readonly string[] | "always" | "conversation-only";

/**
 * Who the assembled skills are for. `"chat"` is the user-facing conversation
 * (the built-in chat and every external MCP client); `"subagent"` is a spawned
 * worker, which receives its task as its one and only user turn and reports back
 * to the orchestrator, not to a person.
 *
 * The distinction is deliberately AUDIENCE, not capability: a worker's toolset
 * already narrows its skills through {@link gatedOutFragments}, and this axis
 * adds only what no toolset could decide — guidance whose whole purpose is to be
 * said out loud to someone.
 */
export type SkillsAudience = "chat" | "subagent";

/**
 * Fragment name → the condition under which it ships. Drivers are absent: they
 * are the roots being assembled, not sections of the assembly.
 */
export const FRAGMENT_GATES: Record<string, FragmentGate> = {
  "time-and-values": "always",
  "working-with-live": "always",
  "getting-help": "conversation-only",

  "transforms-core": TRANSFORM_TOOLS,
  "transforms-expressions": TRANSFORM_TOOLS,
  "transforms-generative": TRANSFORM_TOOLS,
  "code-transforms": TRANSFORM_TOOLS,

  library: ["ppal-library"],
  devices: DEVICE_TOOLS,
  // Reading a Drift or an EQ Eight benefits from the pseudo-param names as much
  // as writing one does, so this is not update-device alone. It stays a strict
  // subset of the devices gate — see the requires-subset test.
  "specialized-devices": ["ppal-read-device", "ppal-update-device"],
  // Moving clips is update-clip; take lanes are create-clip and duplicate.
  arrangement: [UPDATE_CLIP, "ppal-duplicate", CREATE_CLIP],

  "context-standard": ["ppal-context"],
  "context-basic": ["ppal-context"],

  "barbeat-standard": NOTE_TOOLS,
  "barbeat-basic": NOTE_TOOLS,
  "stark-standard": NOTE_TOOLS,
  "stark-basic": NOTE_TOOLS,
  "midi-json": NOTE_TOOLS,
};

/**
 * The fragments to drop for a given toolset: those whose every tool is off.
 *
 * No transitive close over {@link SkillSlotDef.requires} happens here, and none
 * is needed — a dependent's gate is required to be a SUBSET of the gate of what
 * it requires (enforced by test), so a kept fragment's prerequisites are kept
 * too. That is what keeps gating from reintroducing the vocabulary-without-
 * grammar failure `requires` exists to catch, and it does it statically, where
 * the mistake would actually be made (editing this table) rather than at
 * assembly time in a loop no real toolset could reach.
 *
 * @param enabledTools - The tools available to this caller; omit for no gating
 *   (every fragment ships, which is what a caller that doesn't know its toolset
 *   should get)
 * @returns Names of the fragments to omit
 */
export function gatedOutFragments(
  enabledTools?: readonly string[],
): ReadonlySet<string> {
  const dropped = new Set<string>();

  if (enabledTools == null) return dropped;

  const live = new Set(enabledTools);

  for (const [name, gate] of Object.entries(FRAGMENT_GATES)) {
    if (typeof gate === "string") continue;

    if (!gate.some((tool) => live.has(tool))) {
      dropped.add(name);
    }
  }

  return dropped;
}

/**
 * The fragments to drop for a given audience: the `"conversation-only"` ones,
 * for a subagent worker only.
 *
 * Kept separate from {@link gatedOutFragments} because the two answer different
 * questions — "can this caller reach the tool" vs "is there anyone here to talk
 * to" — and a caller may know one without the other. The main chat and every
 * external MCP client omit the audience and drop nothing.
 *
 * These fragments have no `requires` dependents (they are leaves — guidance to
 * relay, never syntax another fragment builds on), so dropping them cannot
 * produce the vocabulary-without-grammar case `warnUnmetRequirements` exists to
 * catch. A test asserts that stays true.
 *
 * @param audience - Who the skills are for; omit for the user-facing default
 * @returns Names of the fragments to omit
 */
export function audienceGatedFragments(
  audience?: SkillsAudience,
): ReadonlySet<string> {
  const dropped = new Set<string>();

  if (audience !== "subagent") return dropped;

  for (const [name, gate] of Object.entries(FRAGMENT_GATES)) {
    if (gate === "conversation-only") dropped.add(name);
  }

  return dropped;
}
