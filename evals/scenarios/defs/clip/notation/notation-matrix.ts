// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Notation-matrix scenario factory: expand ONE notation-neutral spec (a musical
 * intent + the exact notes it should produce) into an apples-to-apples scenario
 * per notation. Every variant sends the SAME prompt and grades against the SAME
 * expected notes; the only thing that differs per variant is `config.notation` —
 * which notation head the model is taught. That makes the pass rates directly
 * comparable across bar|beat / stark / midi-json (the point: which notation
 * lands a musical intent most reliably, and do the opt-in notations beat bar|beat
 * under `--small-model`?).
 *
 * Grading is notation-INDEPENDENT and deterministic: after the model's turn the
 * grader flips the server to midi-json (a `notation` override on the state
 * assertion), reads the clip back as midi-json, and interprets it through the one
 * shared midi-json seam, then compares to the expected notes. No per-notation
 * read-back branch — every variant is graded by the exact same code path
 * regardless of which notation the model wrote in. There is no LLM judge: the
 * state assertion is the sole gate.
 *
 * A spec lists only the notations its target is exactly representable in. Stark
 * is literal and round-trippable (exact chromatic pitch, accidentals, octave
 * marks, absolute /N durations), so it runs every spec; a spec passes a `notations`
 * subset only when a target isn't representable in some notation (e.g. off-16th
 * or triplet timing that no /N note value reaches).
 */

import { interpretMidiJson } from "#src/notation/midi-json/midi-json-notation.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { NOTATIONS, type Notation } from "#src/shared/notation.ts";
import { type EvalAssertion, type EvalScenario } from "../../../types.ts";
import {
  clearSessionSlots,
  diffNotes,
  type ExpectedNote,
  getCreatedClip,
  slotToPath,
  MSG_CONNECT,
  notesMatch,
  TOOL_CONNECT,
  TOOL_READ_CLIP,
} from "../helpers/clip-scenario-helpers.ts";

/** create-clip tool name (turn-1 create assertion). */
const TOOL_CREATE_CLIP = "ppal-create-clip";

/** Shared 4-track set: track 0 = Drums (Drum Rack), track 3 = Lead (melodic). */
export const MATRIX_LIVE_SET = "basic-midi-4-track";

/** Lead track index in basic-midi-4-track (melodic → pitched serialization). */
export const LEAD_TRACK = 3;

/** Drums track index in basic-midi-4-track (Drum Rack → drum serialization). */
export const DRUMS_TRACK = 0;

/** A notation-neutral scenario definition, expanded per notation by the factory. */
export interface NotationNeutralSpec {
  /** Base id; each variant becomes `${baseId}-${notation}`. */
  baseId: string;
  /** Base description; the notation is appended per variant. */
  description: string;
  /** Notation-neutral user turn — pure musical intent, no notation syntax. */
  prompt: string;
  /** Track to create the clip on (LEAD_TRACK or DRUMS_TRACK). */
  track: number;
  /** Expected time signature, e.g. "6/8"; also the grading read-back meter. */
  meter: string;
  /** Exact notes the clip must contain (pitch + start, optional duration). */
  expected: ExpectedNote[];
  /** Notations to emit a variant for. Defaults to every notation. Pass a subset
   *  when the target isn't exactly representable in some notation (e.g. omit
   *  stark for triplet or off-16th-grid timing — its /N note values don't reach
   *  it). */
  notations?: Notation[];
  /** Live Set (defaults to basic-midi-4-track). */
  liveSet?: string;
}

/**
 * Expand a notation-neutral spec into one create-clip scenario per notation.
 *
 * @param spec - The notation-neutral scenario definition
 * @returns One eval scenario per listed notation (id `${baseId}-${notation}`)
 */
export function notationNeutralScenarios(
  spec: NotationNeutralSpec,
): EvalScenario[] {
  const notations = spec.notations ?? [...NOTATIONS];
  const correctSlot = `${spec.track}/0`;
  // The correct slot plus the two an off-by-one model reaches for: `track/1`
  // (treating "scene 1" as 1-based) and `(track+1)/1` (1-based track AND scene).
  // Cleared in setup so `-r` repeats stay clean wherever the clip lands.
  const candidateSlots = [
    correctSlot,
    `${spec.track}/1`,
    `${spec.track + 1}/1`,
  ];

  return notations.map((notation): EvalScenario => ({
    id: `${spec.baseId}-${notation}`,
    description: `${spec.description} (${notation})`,
    kind: "capability",
    liveSet: spec.liveSet ?? MATRIX_LIVE_SET,
    config: { notation },
    messages: [MSG_CONNECT, spec.prompt],
    setup: (mcpClient) => clearSessionSlots(mcpClient, candidateSlots),
    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
      midiJsonNotesAssertion(spec.meter, spec.expected),
      correctPathAssertion(correctSlot),
      { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
    ],
  }));
}

/**
 * Grade the created clip's NOTES deterministically, wherever the model placed
 * it: read it back BY ID (from the create-clip result — so a wrong scene doesn't
 * fail the notes check; `correctPathAssertion` scores placement separately) as
 * midi-json and compare the raw `{p,t,d}` objects to `expected`. The
 * `notation: "midi-json"` override flips the server to midi-json before the read
 * (via POST /config, which merges — the scenario's finally-block resetConfig
 * restores defaults), so the notes come back as a plain array we parse directly
 * — no notation grammar involved, whatever the model wrote in. Fails closed: a
 * wrong/absent time signature, a missing clip/notes, or an unparseable payload
 * all return false.
 *
 * @param meter - Expected time signature (e.g. "4/4"), also gates the read
 * @param expected - Exact notes the clip must contain (pitch + start, optional
 *   duration) in Ableton quarter beats; the read-back is scaled from midi-json's
 *   musical beats to quarter beats by the meter denominator, so the comparison is
 *   like-for-like in any meter (not only 4/4)
 * @returns State assertion
 */
function midiJsonNotesAssertion(
  meter: string,
  expected: ExpectedNote[],
): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: (turns) => ({
      id: getCreatedClip(turns).id ?? "",
      include: ["notes", "timing"],
    }),
    notation: "midi-json",
    expect: (result: unknown): boolean => {
      const events = parseMidiJsonClip(result, meter);

      return events != null && notesMatch(events, expected);
    },
    explain: (result: unknown): string => {
      const clip = result as { timeSignature?: string };

      if (clip.timeSignature !== meter) {
        return `time signature: expected ${meter}, actual ${clip.timeSignature ?? "(none)"}`;
      }

      const events = parseMidiJsonClip(result, meter);

      if (events == null)
        return "clip notes missing or not parseable as midi-json";

      return diffNotes(events, expected);
    },
  };
}

/**
 * Parse a read-clip result (read back in midi-json) into note events, or null
 * when the meter is wrong or the notes payload is missing/unparseable. Routes the
 * raw notes string through the real {@link interpretMidiJson} seam (same code the
 * tool uses), so ratio durations (`d:1/3` tuplets) parse and musical beats are
 * scaled to Ableton quarter beats by the clip's meter denominator — exactly like
 * the sibling bar|beat/stark path in `clipStateAssertion`. Shared by the grading
 * `expect` (pass/fail) and `explain` (diff) so both read the clip identically.
 *
 * @param result - The parsed read-clip tool result
 * @param meter - Required time signature; a mismatch returns null (fails closed).
 *   Its denominator scales musical beats → Ableton quarter beats.
 * @returns The clip's notes as events, or null when ungradeable
 */
function parseMidiJsonClip(result: unknown, meter: string): NoteEvent[] | null {
  const clip = result as { notes?: unknown; timeSignature?: string };

  if (clip.timeSignature !== meter || typeof clip.notes !== "string") {
    return null;
  }

  const [, timeSigDenominator] = meter.split("/").map(Number);

  try {
    return interpretMidiJson(clip.notes, { timeSigDenominator });
  } catch {
    return null; // unparseable midi-json payload
  }
}

/**
 * Score clip PLACEMENT separately from the notes: pass only when the model
 * created the clip in `correctSlot` (the prompt's "scene 1" = trackIndex/0). A
 * small model that notated the drums perfectly but dropped them in the wrong
 * scene fails this check while still passing the notes check — so scene-index
 * confusion is measured on its own axis instead of masking notation skill.
 *
 * @param correctSlot - The slot the clip should land in (e.g. "0/0")
 * @returns Custom assertion
 */
function correctPathAssertion(correctSlot: string): EvalAssertion {
  const correctPath = slotToPath(correctSlot);

  return {
    type: "custom",
    description: `clip created at the correct path (${correctPath})`,
    assert: (turns) => getCreatedClip(turns).path === correctPath,
  };
}
