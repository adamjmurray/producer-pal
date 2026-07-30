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
 *
 * Spanning both directions is deliberate and can't be narrowed to the writers: a
 * read-only caller still needs the grammar to parse what read-clip RETURNS. What
 * a read-only caller does NOT need is the authoring syntax, and that is a
 * separate `-write` fragment rather than a narrower gate here — see
 * {@link NOTE_WRITE_TOOLS} and ADR-0019.
 */
const NOTE_TOOLS = [
  "ppal-read-clip",
  CREATE_CLIP,
  UPDATE_CLIP,
  "ppal-read-track",
  "ppal-read-scene",
] as const;

/**
 * The two tools that take `notes` as INPUT — the gate on a notation head's
 * `-write` sibling. A strict subset of {@link NOTE_TOOLS}, so the requires-subset
 * invariant holds: any toolset keeping the authoring half also keeps the base
 * head whose grammar it builds on.
 */
const NOTE_WRITE_TOOLS = [CREATE_CLIP, UPDATE_CLIP] as const;

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
  // Narrower than the standard tiers on purpose: they teach `transforms`, which
  // create-clip and duplicate also take, while the small-model fragment teaches
  // only `preTransforms` — an update-clip parameter and nothing else's.
  "transforms-basic": [UPDATE_CLIP],

  library: ["ppal-library"],
  devices: DEVICE_TOOLS,
  // Reading a Drift or an EQ Eight benefits from the pseudo-param names as much
  // as building or editing one does, so all three device tools carry it — same
  // gate as `devices`, which also satisfies the requires-subset test.
  "specialized-devices": DEVICE_TOOLS,
  // Every clip tool that can put a clip on the timeline or report where one
  // already sits: moving clips is update-clip, take lanes are create-clip and
  // duplicate, and read-clip is how arrangement positions come back.
  arrangement: [CREATE_CLIP, "ppal-read-clip", UPDATE_CLIP, "ppal-duplicate"],

  "context-standard": ["ppal-context"],
  "context-basic": ["ppal-context"],

  "barbeat-standard": NOTE_TOOLS,
  "barbeat-basic": NOTE_TOOLS,
  "stark-standard": NOTE_TOOLS,
  "stark-basic": NOTE_TOOLS,
  "midi-json": NOTE_TOOLS,

  // The authoring halves. The two empty ones are placeholders for heads that
  // aren't split (see builtin-fragments.ts); gating them the same way keeps the
  // rule uniform, and an empty body costs a caller nothing either way.
  "barbeat-standard-write": NOTE_WRITE_TOOLS,
  "stark-standard-write": NOTE_WRITE_TOOLS,
  "midi-json-standard-write": NOTE_WRITE_TOOLS,
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
