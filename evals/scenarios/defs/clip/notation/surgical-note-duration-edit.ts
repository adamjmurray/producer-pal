// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Real-world surgical-edit scenario: shorten two existing notes' durations
 * WITHOUT rewriting the whole clip.
 *
 * Motivated by a real session where the model, asked to shorten two notes, was
 * about to rewrite the entire clip — which (because `notes` MERGES) risks
 * duplicates/leftovers. The skills now state the merge/overwrite rule plus a
 * "don't rewrite the whole clip for a few notes" anti-pattern; this scenario
 * guards that behavior.
 *
 * Self-calibrating: it does not hardcode the lead clip's pitches. It captures
 * the original notes from the model's first read and compares them to a final
 * read, so it works whatever the fixture contains.
 *
 * Two surgical paths both PASS:
 *   - preTransforms/transforms with a scoped `duration` change
 *   - restating just the two notes in `notes` (overwrite at same pitch+start,
 *     which exercises real Live's add_new_notes overwrite)
 * Handing the whole clip back as `notes` FAILS (the full-rewrite anti-pattern).
 */

import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { getToolCalls } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import {
  assertNotesRead,
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "../clip-scenario-helpers.ts";

const LIVE_SET = "basic-with-drum-and-lead-clips";
const TOOL_READ_CLIP = "ppal-read-clip";
/** A note matches its pre-edit twin when pitch is equal and start within this. */
const START_TOLERANCE = 0.01;

/**
 * Parse the lead clip's notes from the last ppal-read-clip result in a turn.
 *
 * @param turns - All turn results
 * @param turn - Turn index containing the read
 * @returns Parsed note events, or null if no clip read with notes is found
 */
function readClipNotes(
  turns: EvalTurnResult[],
  turn: number,
): NoteEvent[] | null {
  const reads = getToolCalls(turns, turn).filter(
    (c) => c.name === TOOL_READ_CLIP && c.result != null,
  );

  for (const call of reads.reverse()) {
    try {
      const parsed = JSON.parse(String(call.result)) as {
        notes?: string;
        timeSignature?: string;
      };

      if (parsed.notes == null) continue;

      const [num, den] = (parsed.timeSignature ?? "4/4").split("/").map(Number);

      return interpretNotation(parsed.notes, {
        timeSigNumerator: num ?? 4,
        timeSigDenominator: den ?? 4,
      });
    } catch {
      // non-JSON / unexpected shape — try the next read
    }
  }

  return null;
}

/**
 * Count pitch tokens (e.g. C3, F#4, Bb2) in a bar|beat notes string. Used as a
 * proxy for "how many notes did the model hand back" to detect a full rewrite.
 *
 * @param notes - The notes argument from an update-clip call
 * @returns Number of pitch tokens
 */
function countPitchTokens(notes: string): number {
  return (notes.match(/[A-G](#|b)?[0-8]/g) ?? []).length;
}

/**
 * Verify post-edit durations: each target note is roughly halved, every other
 * note is unchanged. Throws on the first mismatch.
 *
 * @param before - Notes before the edit
 * @param after - Notes after the edit
 * @param targets - The notes that should be halved
 */
function checkDurations(
  before: NoteEvent[],
  after: NoteEvent[],
  targets: NoteEvent[],
): void {
  for (const orig of before) {
    const match = after.find(
      (n) =>
        n.pitch === orig.pitch &&
        Math.abs(n.start_time - orig.start_time) < START_TOLERANCE,
    );

    if (match == null) {
      throw new Error(
        `note ${orig.pitch}@${orig.start_time.toFixed(2)} missing after edit`,
      );
    }

    const isTarget = targets.some(
      (t) =>
        t.pitch === orig.pitch &&
        Math.abs(t.start_time - orig.start_time) < START_TOLERANCE,
    );
    const ratio = match.duration / orig.duration;

    if (isTarget && !(ratio > 0.3 && ratio < 0.7)) {
      throw new Error(
        `${orig.pitch}@${orig.start_time.toFixed(2)} not halved: ` +
          `${orig.duration.toFixed(2)} → ${match.duration.toFixed(2)}`,
      );
    }

    if (!isTarget && Math.abs(match.duration - orig.duration) > 0.02) {
      throw new Error(
        `${orig.pitch}@${orig.start_time.toFixed(2)} changed unexpectedly: ` +
          `${orig.duration.toFixed(2)} → ${match.duration.toFixed(2)}`,
      );
    }
  }
}

/**
 * Assert the model made a SURGICAL edit, not a full clip rewrite. A scoped
 * duration transform or a `notes` arg smaller than the clip passes; handing
 * back the whole clip's worth of notes fails.
 *
 * @param readTurn - Turn whose read established the clip's note count
 * @param editTurn - Turn that performed the update-clip edit
 * @returns A custom assertion
 */
function assertSurgicalNotRewrite(
  readTurn: number,
  editTurn: number,
): EvalAssertion {
  return {
    type: "custom",
    description: "duration edit is surgical, not a full clip rewrite",
    assert: (turns) => {
      const original = readClipNotes(turns, readTurn);

      if (original == null) {
        throw new Error("could not read original clip notes");
      }

      const calls = getToolCalls(turns, editTurn).filter(
        (c) => c.name === TOOL_UPDATE_CLIP,
      );

      if (calls.length === 0) {
        throw new Error("no ppal-update-clip call in the edit turn");
      }

      const scoped = calls.some((c) =>
        /duration/i.test(
          `${String(c.args.preTransforms ?? "")} ${String(c.args.transforms ?? "")}`,
        ),
      );
      const maxNotes = Math.max(
        0,
        ...calls.map((c) => countPitchTokens(String(c.args.notes ?? ""))),
      );

      if (scoped || (maxNotes > 0 && maxNotes < original.length)) return true;

      throw new Error(
        `expected a scoped duration transform or a small notes restate, got ` +
          `${maxNotes} note tokens vs ${original.length} in the clip (full rewrite)`,
      );
    },
  };
}

/**
 * Assert the outcome: the two latest notes are now roughly half as long, every
 * other note is unchanged, and the note count is identical (no duplicates or
 * leftovers). Compares the original read to a final read — self-calibrating.
 *
 * @param readTurn - Turn with the original read
 * @param verifyTurn - Turn with the final read
 * @returns A custom assertion
 */
function assertShortenOutcome(
  readTurn: number,
  verifyTurn: number,
): EvalAssertion {
  return {
    type: "custom",
    description: "last two notes halved, all others unchanged, no duplicates",
    assert: (turns) => {
      const before = readClipNotes(turns, readTurn);
      const after = readClipNotes(turns, verifyTurn);

      if (before == null || after == null) {
        throw new Error("could not read clip notes before/after the edit");
      }

      if (after.length !== before.length) {
        throw new Error(
          `note count changed (${before.length} → ${after.length}): ` +
            `likely duplicates or leftovers from a rewrite`,
        );
      }

      const targets = [...before]
        .sort((a, b) => a.start_time - b.start_time)
        .slice(-2);

      checkDurations(before, after, targets);

      return true;
    },
  };
}

export const surgicalNoteDurationEdit: EvalScenario = {
  id: "surgical-note-duration-edit",
  description:
    "Shorten two existing notes' durations without rewriting the whole clip",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "Find the lead melody clip in the first scene and read its notes",
    "Make the last two notes of that melody half as long. Leave every other note exactly as it is.",
    "Read the notes of that same lead clip again so we can confirm the change.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertNotesRead(1),
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    assertSurgicalNotRewrite(1, 2),
    assertShortenOutcome(1, 3),
    {
      type: "llm_judge",
      prompt: `Evaluate the edit (turns 2–3):
1. ONLY the last two notes of the lead melody were shortened to roughly half their original length (e.g. quarter → eighth)
2. Every other note is unchanged (same pitch, start, and duration)
3. No duplicate or leftover notes were introduced — the total note count is unchanged
4. The model did NOT rewrite the whole clip; it edited only the two target notes (via preTransforms/transforms, or by restating just those two notes)`,
    },
    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
  ],
};
