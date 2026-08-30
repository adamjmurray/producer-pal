// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared assertion helpers for clip evaluation scenarios.
 */

import { argText } from "../../arg-text.ts";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText, parseToolResult } from "#evals/chat/mcp.ts";
import { hasPerfectMatching } from "#evals/shared/bipartite-matching.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  getToolCalls,
  lastSuccessfulToolCall,
  parsedToolResult,
} from "../../../assertions/index.ts";
import { CONNECT_MESSAGE } from "../../../helpers/seed-connect/seed-connect.ts";
import { type EvalAssertion, type EvalTurnResult } from "../../../types.ts";

/** Connect tool name (turn-0 connect assertion). */
export const TOOL_CONNECT = "ppal-connect";

/** update-clip tool name. */
export const TOOL_UPDATE_CLIP = "ppal-update-clip";

/** read-clip tool name. */
export const TOOL_READ_CLIP = "ppal-read-clip";

/** create-clip tool name (turn-1 create assertion in single-clip scenarios). */
export const TOOL_CREATE_CLIP = "ppal-create-clip";

/** Standard turn-0 message that opens a connection to Live. */
export const MSG_CONNECT = CONNECT_MESSAGE;

/** Standard message to read the drum clip in scene 1 (drum scenarios). */
export const READ_DRUM_NOTES =
  "Find the drum clip in the first scene and read its notes";

/**
 * Create a custom assertion that verifies clips were found and notes were read.
 * Checks that only ppal-read-* tools were called and at least one read pulled in
 * notes — either explicitly ("notes" in the include array) or via the "*"
 * wildcard, which returns every field (notes included). A capable model often
 * reaches for `include: ["*"]` to read a clip comprehensively, and that must
 * count as reading the notes.
 *
 * @param turn - Turn index to check
 * @returns Custom assertion for clip reading
 */
export function assertNotesRead(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: "clips were found and notes were read",
    assert: (turns: EvalTurnResult[]) => {
      const calls = getToolCalls(turns, turn);
      let notesRead = false;

      for (const { name, args } of calls) {
        if (!name.startsWith("ppal-read-")) {
          throw new Error(`unexpected non-read tool call: ${name}`);
        }

        if (
          name !== "ppal-read-live-set" &&
          Array.isArray(args.include) &&
          (args.include.includes("notes") || args.include.includes("*"))
        ) {
          notesRead = true;
        }
      }

      if (!notesRead) {
        throw new Error("the clip notes should have been read");
      }

      return true;
    },
  };
}

/**
 * Build a `state` assertion that re-reads the clip in `slot` and re-interprets
 * its notation back into NoteEvents, then defers to `check` for the verdict.
 * Reading the final clip state (not the create/update transcript) grades the
 * OUTCOME, not the path — immune to tool-error strings and to which of several
 * tool calls "won". Fails closed before `check` runs: a wrong/absent time
 * signature, missing notes, or unparseable notation all return false.
 *
 * @param slot - Session clip slot to read (trackIndex/sceneIndex)
 * @param meter - Expected time signature (e.g. "6/8"); also the interpret meter
 * @param check - Verdict over the re-interpreted notes (start_time in Ableton
 *   quarter beats); only called once the read succeeded in `meter`
 * @param interpret - Notation interpreter (defaults to bar|beat). Pass a
 *   notation-specific interpreter for non-bar|beat scenarios — the only thing
 *   that differs.
 * @returns State assertion
 */
export function clipStateAssertion(
  slot: string,
  meter: string,
  check: (events: NoteEvent[]) => boolean,
  interpret: NotationInterpreter = interpretNotation,
): EvalAssertion {
  const [numerator, denominator] = meter.split("/").map(Number);

  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: { path: slotToPath(slot), include: ["notes", "timing"] },
    expect: (result: unknown): boolean => {
      const clip = result as { notes?: string; timeSignature?: string };

      if (clip.timeSignature !== meter || !clip.notes) return false;

      let events: NoteEvent[];

      try {
        events = interpret(clip.notes, {
          timeSigNumerator: numerator,
          timeSigDenominator: denominator,
        });
      } catch {
        return false; // unparseable notation — treat as a failed clip
      }

      return check(events);
    },
  };
}

/** A notation interpreter compatible with {@link clipStateAssertion}. Meter
 * fields are optional so both the bar|beat and stark interpreters satisfy it
 * (stark ignores the denominator). */
export type NotationInterpreter = (
  notes: string,
  opts: { timeSigNumerator?: number; timeSigDenominator?: number },
) => NoteEvent[];

/**
 * One expected note: MIDI pitch, start (Ableton quarter beats), duration.
 * `pitch` may be a SET of acceptable pitches (any-of). Used for drum pads whose
 * "role" spans several MIDI notes: stark maps a drum name to a fixed GM
 * pitch (e.g. snare→38) while a bar|beat/midi-json model reads the actual Drum
 * Rack and picks whatever pad that rack labels a snare (Eb1=39, E1=40 in
 * basic-midi-4-track). Accepting the family keeps the notations graded
 * against the SAME expected set (the matrix's apples-to-apples invariant) instead
 * of rewarding whichever notation happens to match this rack's GM alignment. The
 * rhythm (start) is still asserted exactly; only the pad choice is loosened.
 */
export interface ExpectedNote {
  pitch: number | number[];
  start: number;
  duration?: number;
}

/**
 * Lowest acceptable pitch of an expected note — the sort key that lines a
 * pitch-set note up with the actual note in its (non-overlapping) family.
 *
 * @param p - The expected pitch or set of acceptable pitches
 * @returns The single value, or the minimum of the set
 */
function pitchSortKey(p: number | number[]): number {
  return Array.isArray(p) ? Math.min(...p) : p;
}

/**
 * Whether an actual MIDI pitch satisfies an expected pitch (a single value or an
 * any-of set).
 *
 * @param actual - The read-back note's pitch
 * @param expected - The expected pitch or set of acceptable pitches
 * @returns True when actual equals the value or is a member of the set
 */
function pitchMatches(actual: number, expected: number | number[]): boolean {
  return Array.isArray(expected)
    ? expected.includes(actual)
    : actual === expected;
}

/**
 * Order-independent verdict: the interpreted events match `expected` exactly on
 * pitch (or membership in a pitch-set) and start position (and duration when
 * given). Velocity is never checked (it is often bucketed/randomized on
 * interpret). Shared by the bar|beat and stark read-back checks.
 *
 * @param events - Re-interpreted notes from the read-back
 * @param expected - Expected notes (pitch + start, optional duration)
 * @returns True when the note sets match
 */
export function notesMatch(
  events: NoteEvent[],
  expected: ExpectedNote[],
): boolean {
  if (events.length !== expected.length) return false;

  // A greedy sort-then-pair-by-index check can wrongly fail when expected notes
  // carry OVERLAPPING any-of pitch sets at the same start (e.g. [40,50] and [45]
  // vs actual {45,50}): index-pairing forces 45↔[40,50] and misses the valid
  // assignment 50↔[40,50], 45↔[45]. Accept iff a perfect matching exists between
  // actual and expected notes under the per-pair predicate.
  return hasPerfectMatching(events, expected, satisfiesExpected);
}

/**
 * Whether an actual event can stand in for an expected note: pitch (value or
 * any-of membership), start, and duration (only when the expected pins it).
 *
 * @param event - Re-interpreted read-back note
 * @param want - Expected note
 * @returns True when the event satisfies the expected note's constraints
 */
function satisfiesExpected(event: NoteEvent, want: ExpectedNote): boolean {
  return (
    pitchMatches(event.pitch, want.pitch) &&
    Math.abs(event.start_time - want.start) < EPS &&
    (want.duration == null || Math.abs(event.duration - want.duration) < EPS)
  );
}

/** Float tolerance for note start_time / duration comparisons (in beats). */
const EPS = 1e-6;

/**
 * Human-readable expected-vs-actual note diff for a failed `notesMatch`, in
 * midi-json terms (`p`itch / `t`ime / `d`uration). Pairs the two sets after the
 * SAME (start, pitch) sort `notesMatch` uses, so the printed rows line up with
 * the comparison that actually failed and each mismatch is tagged with the field
 * (pitch/start/duration) that diverged. Duration is only shown/compared when the
 * expected note pins it. Surfaced in the state assertion's `details.diff` and the
 * console failure line so a failing drum/melody scenario is debuggable at a
 * glance instead of eyeballing two 22-note dumps.
 *
 * @param events - Re-interpreted notes from the read-back (actual)
 * @param expected - Expected notes (pitch + start, optional duration)
 * @returns Multi-line diff string
 */
export function diffNotes(
  events: NoteEvent[],
  expected: ExpectedNote[],
): string {
  const sortedEvents = events.toSorted(
    (a, b) => a.start_time - b.start_time || a.pitch - b.pitch,
  );
  const sortedExpected = expected.toSorted(
    (a, b) =>
      a.start - b.start || pitchSortKey(a.pitch) - pitchSortKey(b.pitch),
  );
  const rows: string[] = [
    `count: expected ${expected.length}, actual ${events.length}`,
  ];
  const max = Math.max(sortedEvents.length, sortedExpected.length);

  for (let i = 0; i < max; i++) {
    const want = sortedExpected[i];
    const got = sortedEvents[i];

    rows.push(diffNoteRow(want, got));
  }

  return rows.join("\n");
}

/**
 * Format an expected note as a midi-json-ish `p… t… d…` token (duration omitted
 * when the expectation doesn't pin it).
 *
 * @param w - Expected note
 * @returns One-line token
 */
function fmtExpected(w: ExpectedNote): string {
  const dur = w.duration == null ? "" : ` d${w.duration}`;
  const pitch = Array.isArray(w.pitch)
    ? `p{${w.pitch.join("|")}}`
    : `p${w.pitch}`;

  return `${pitch} t${w.start}${dur}`;
}

/**
 * Format an actual note event as a midi-json-ish `p… t… d…` token.
 *
 * @param g - Actual note event
 * @returns One-line token
 */
function fmtActual(g: NoteEvent): string {
  return `p${g.pitch} t${g.start_time} d${g.duration}`;
}

/**
 * Format one paired expected/actual note row for `diffNotes`, tagging the field
 * that diverged (or a missing/extra note when one side is absent).
 *
 * @param want - Expected note at this sorted index (may be absent)
 * @param got - Actual note at this sorted index (may be absent)
 * @returns One diff line
 */
function diffNoteRow(
  want: ExpectedNote | undefined,
  got: NoteEvent | undefined,
): string {
  if (want == null) return `  + extra   ${fmtActual(got as NoteEvent)}`;
  if (got == null) return `  - missing ${fmtExpected(want)}`;

  const reasons: string[] = [];

  if (!pitchMatches(got.pitch, want.pitch)) reasons.push("pitch");

  if (Math.abs(got.start_time - want.start) >= EPS) reasons.push("start");

  if (want.duration != null && Math.abs(got.duration - want.duration) >= EPS) {
    reasons.push("duration");
  }

  if (reasons.length === 0) return `  ✓ ${fmtExpected(want)}`;

  const detail = `expected ${fmtExpected(want)} — actual ${fmtActual(got)}`;

  return `  ✗ ${detail}  (${reasons.join(", ")})`;
}

/**
 * Extract the transforms expressions from a ppal-update-clip call in the given
 * turn. transforms is now a single newline-separated string; a legacy array
 * value is still tolerated and joined with newlines so selector/expression
 * parsing in callers sees the raw expression text.
 * Throws descriptive errors if the tool call or transforms parameter is missing.
 *
 * @param turns - All turn results
 * @param turn - Turn index to extract from
 * @param toolName - Tool name to look for
 * @returns The transforms expressions joined with newlines
 */
export function getTransforms(
  turns: EvalTurnResult[],
  turn: number,
  toolName: string,
): string {
  const updateCall = lastSuccessfulToolCall(turns, turn, toolName);

  if (!updateCall) throw new Error(`${toolName} not found in turn ${turn}`);

  const raw = updateCall.args.transforms;
  const transforms = Array.isArray(raw) ? raw.join("\n") : argText(raw);

  if (!transforms) {
    throw new Error(`transforms parameter missing in turn ${turn}`);
  }

  return transforms;
}

/**
 * Pull the raw `notes` string from a ppal-create-clip call in the given turn.
 * Throws (failing the calling assertion with a message) when the call or the
 * `notes` parameter is missing. Used by scenarios that grade HOW the model
 * notated a clip — bracket cycling, stream zips — not just the resulting notes,
 * which read back identically however they were written.
 *
 * @param turns - All turn results
 * @param turn - Turn index containing the create-clip call (default 1)
 * @returns The raw notes string passed to ppal-create-clip
 */
export function getCreateClipNotes(turns: EvalTurnResult[], turn = 1): string {
  const call = lastSuccessfulToolCall(turns, turn, TOOL_CREATE_CLIP);

  if (!call) throw new Error(`ppal-create-clip not found in turn ${turn}`);

  const notes = call.args.notes;

  if (typeof notes !== "string") {
    throw new Error("create-clip notes parameter is missing or not a string");
  }

  return notes;
}

/**
 * Pull the created clip's id and path from the ppal-create-clip call in the
 * given turn. Lets a grading read fetch the clip by id (wherever the model
 * placed it — small models often misjudge 0-based scene indexing) while a
 * separate assertion checks whether it landed in the intended slot.
 *
 * Both come off the RESULT, not the args. The tool takes a destination several
 * ways — `path`, the hidden trackIndex/sceneIndex alias, the tolerated old
 * "0/0" spelling — and reports back one canonical path either way. Grading the
 * args would score a model that used a spelling this reader didn't know as a
 * placement failure for a clip that landed correctly.
 *
 * Reads the last SUCCESSFUL create call: a model that hits a param error is
 * told to fix the args and retry, and grading the discarded first attempt got
 * an empty id, so the read-back died with `id "" does not exist` and failed a
 * model for recovering correctly.
 *
 * @param turns - All turn results
 * @param turn - Turn index containing the create-clip call (default 1)
 * @returns The created clip's id and path (either may be undefined if absent)
 */
export function getCreatedClip(
  turns: EvalTurnResult[],
  turn = 1,
): { id?: string; path?: string } {
  const call = lastSuccessfulToolCall(turns, turn, TOOL_CREATE_CLIP);

  if (!call) return {};

  const parsed = parsedToolResult(call);

  return {
    id: parsed?.id == null ? undefined : argText(parsed.id),
    path: typeof parsed?.path === "string" ? parsed.path : undefined,
  };
}

/**
 * Parse a clip's notes from the read results in a turn, back into NoteEvents
 * (start_time in musical beats). Scans every `ppal-read-*` result, most recent
 * first — not just `ppal-read-clip`: the model is free to read a clip's notes
 * via `ppal-read-scene` (clips nested in a `clips` array) or `ppal-read-track`,
 * and a check that only understood `ppal-read-clip` would mis-grade those
 * equally valid paths. Self-calibrating: reads the clip's own time signature so
 * bar math works in any meter. Returns the notes plus beatsPerBar (the meter
 * numerator) and the clip id so callers can compute bar boundaries and match a
 * specific clip across reads.
 *
 * @param turns - All turn results
 * @param turn - Turn index containing the read
 * @param clipId - When given, only a clip whose id matches is returned (needed
 *   when a scene read returns several clips with notes)
 * @returns Parsed notes, beats-per-bar, and clip id, or null if none found
 */
export function readClipNotesFromTurn(
  turns: EvalTurnResult[],
  turn: number,
  clipId?: string,
): { notes: NoteEvent[]; beatsPerBar: number; id?: string } | null {
  const reads = getToolCalls(turns, turn).filter(
    (c) => c.name.startsWith("ppal-read-") && c.result != null,
  );

  for (const call of reads.toReversed()) {
    let parsed: unknown;

    try {
      parsed = parseToolResult(String(call.result));
    } catch {
      continue; // unparseable read result
    }

    for (const clip of clipObjectsFrom(parsed)) {
      if (clip.notes == null) continue;

      // When a clipId is requested, require an exact id match — skip candidates
      // with a different id AND candidates with no id, so a malformed/idless
      // nested entry can't stand in for the requested clip.
      if (clipId != null && (clip.id ?? "") !== clipId) {
        continue;
      }

      const [num, den] = (clip.timeSignature ?? "4/4").split("/").map(Number);

      try {
        const notes = interpretNotation(clip.notes, {
          timeSigNumerator: num ?? 4,
          timeSigDenominator: den ?? 4,
        });

        return { notes, beatsPerBar: num ?? 4, id: clip.id };
      } catch {
        // unparseable notation — keep scanning other clips/reads
      }
    }
  }

  return null;
}

/** Minimal clip shape the note-reading helpers care about. */
interface ClipShape {
  id?: string;
  notes?: string;
  timeSignature?: string;
}

/**
 * Extract clip-shaped objects from a parsed read-* result. A read-clip result
 * IS the clip; read-scene/read-track nest clips in `clips` (and, for arrangement
 * reads, `sessionClips`/`arrangementClips`) arrays. Returns every candidate so
 * the caller can pick the one with notes (optionally matching a clip id).
 *
 * Note: only these top-level arrays are scanned. Take-lane clips live deeper
 * (read-track nests them under `takeLanes[].clips`) and are NOT descended into —
 * no current scenario reads notes from a take lane. Add that traversal here if
 * one ever does.
 *
 * @param parsed - A parsed JSON read result
 * @returns Candidate clip objects (the result itself plus any nested clips)
 */
function clipObjectsFrom(parsed: unknown): ClipShape[] {
  if (parsed == null || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  const out: ClipShape[] = [obj];

  for (const key of ["clips", "sessionClips", "arrangementClips"]) {
    const arr = obj[key];

    if (Array.isArray(arr)) {
      for (const clip of arr) {
        if (clip != null && typeof clip === "object") {
          out.push(clip as ClipShape);
        }
      }
    }
  }

  return out;
}

/**
 * Convert a "trackIndex/sceneIndex" slot string into the path the clip tools
 * take. Scenario definitions still name slots in the older format, so the
 * conversion lives here rather than at every call site.
 * @param slot - Slot string, "trackIndex/sceneIndex"
 * @returns The equivalent session path, "t<track>/s<scene>"
 */
export function slotToPath(slot: string): string {
  const [trackIndex, sceneIndex] = slot.split("/");

  return `t${trackIndex}/s${sceneIndex}`;
}

/**
 * Delete any existing session clips in the given slots. Use as a scenario
 * `setup` so a run against an already-open Live Set starts with empty slots
 * instead of inheriting clips from the previous one.
 *
 * @param mcpClient - MCP client for tool calls
 * @param slots - Session clip slots to clear (e.g. ["0/0", "0/1", "0/2"])
 */
export async function clearClipSlots(
  mcpClient: Client,
  slots: string[],
): Promise<void> {
  const ids: string[] = [];

  for (const slot of slots) {
    const result = await mcpClient.callTool({
      name: "ppal-read-clip",
      arguments: { path: slotToPath(slot), include: [] },
    });

    let id: unknown;

    try {
      id = (parseToolResult(extractToolResultText(result)) as { id?: unknown })
        .id;
    } catch {
      id = null; // empty/unparseable slot read — nothing to delete
    }

    if (id != null) ids.push(argText(id));
  }

  if (ids.length > 0) {
    await mcpClient.callTool({
      name: "ppal-delete",
      arguments: { id: ids.join(","), type: "clip" },
    });
  }
}
