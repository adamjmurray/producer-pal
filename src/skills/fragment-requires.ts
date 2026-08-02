// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Which fragments a fragment is incomplete without. The carve is by task, not by
// independence: a few fragments teach a vocabulary whose GRAMMAR lives in
// another (the transforms tiers name `swing()`/`ratchet()` but the
// `[selector:] param op expr` shape is only in transforms-core), or emit a `###`
// section under another's `##` heading.
//
// Keyed by FRAGMENT name rather than declared on SkillSlotDef, for the same
// reason the gate table is: the two sets differ. `code-transforms` is a real
// fragment with no override slot — nothing stable for a user to customize, since
// it only carries text in a code-execution build — but it still emits its `###`
// under transforms-core's `##`, and on the slot type that edge could not be
// written down at all.
//
// Declared rather than described in prose because it is checked mechanically:
// buildSkills warns when a document includes a fragment without its
// prerequisites, and a test holds the gate table to the subset rule that lets
// gating skip a transitive close. The docs trimming table has to match it too,
// by hand.

/** The one fragment four others build their syntax on. */
const TRANSFORMS_CORE = "transforms-core";

/** Where the units and the C3=60 octave convention are defined. */
const TIME_AND_VALUES = "time-and-values";

/**
 * Fragment name → the fragments it needs. Edges point at what a fragment NEEDS,
 * so closing a selection would be a transitive walk; a test asserts the edges
 * stay acyclic so such a walk terminates.
 */
export const FRAGMENT_REQUIRES: Record<string, readonly string[]> = {
  "transforms-editing": [TRANSFORMS_CORE],
  "transforms-expressions": [TRANSFORMS_CORE],
  "transforms-generative": [TRANSFORMS_CORE, "transforms-expressions"],
  "code-transforms": [TRANSFORMS_CORE],
  [TRANSFORMS_CORE]: [TIME_AND_VALUES],

  "devices-write": ["devices"],
  "specialized-devices": ["devices"],
  // Not a cross-reference but the same failure: pad paths are written `pC1`, and
  // with no notation head in a device-only toolset, time-and-values is the only
  // place saying Live counts octaves from C3=60 (C1 is 36, not the MIDI-standard
  // 24). Without it a device build lands a full octave off.
  devices: [TIME_AND_VALUES],

  "arrangement-write": ["arrangement"],

  // The standard notation head defers note values and the dual-meter rule; the
  // basic heads and midi-json spell their own out, so neither needs the edge.
  "barbeat-standard": [TIME_AND_VALUES],
  "working-with-live": [TIME_AND_VALUES],

  // The notation authoring halves, each under the head whose grammar it builds
  // on. midi-json's two are absent: an empty fragment can't be incomplete.
  "barbeat-standard-write": ["barbeat-standard"],
  "barbeat-basic-write": ["barbeat-basic"],
  "stark-standard-write": ["stark-standard"],
  "stark-basic-write": ["stark-basic"],
};

/**
 * The fragments one fragment is incomplete without.
 *
 * Names reach this from user text (an override filename, an include ref), so the
 * `hasOwn` guard is load-bearing the same way it is in `fragmentGate`: a bare
 * index would hand back `Object.prototype.toString` for a fragment named
 * `toString`.
 *
 * @param name - Fragment name
 * @returns The fragments it requires, empty when it requires none
 */
export function fragmentRequires(name: string): readonly string[] {
  // hasOwn doesn't narrow an index signature; the key is present by the check.
  return Object.hasOwn(FRAGMENT_REQUIRES, name)
    ? (FRAGMENT_REQUIRES[name] as readonly string[])
    : [];
}
