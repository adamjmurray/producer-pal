// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";
import { applyNotesToClip } from "#src/tools/clip/code-exec/clip-notes-exchange.ts";
import { getClipNoteCount } from "#src/tools/shared/clip/clip-notes.ts";
import { newClipReasons } from "../../../helpers/entries/clip-reasons.ts";
import { handleNoteUpdates } from "../../../helpers/notes/note-updates.ts";
import { applyTransformsToExistingNotes } from "../../../helpers/notes/note-transforms.ts";
import { rawNote } from "../notes-mock-test-helpers.ts";

// A looping clip, loop 0..4, with end_marker out at 16. Notes at beat 0 and 10:
// the one at 10 starts past loop_end, so it never plays.
const REGION: Record<string, number> = {
  is_midi_clip: 1,
  looping: 1,
  length: 4,
  start_marker: 0,
  loop_start: 0,
  loop_end: 4,
  end_marker: 16,
};
const INSIDE = rawNote(60, 0, 1);
const PAST_LOOP_END = rawNote(64, 10, 2);

const CONTEXT: ClipContext = {
  clipDuration: 4,
  clipIndex: 0,
  clipCount: 1,
  barDuration: 4,
  timeSigDenominator: 4,
};

/**
 * A clip that keeps its notes the way Live does: a read or a remove touches
 * only the notes starting inside the span it names.
 * @returns The clip and the notes it holds
 */
function makeLoopingClip(): {
  clip: LiveAPI;
  held: Array<Record<string, number>>;
} {
  const held: Array<Record<string, number>> = [INSIDE, PAST_LOOP_END];
  const inSpan = (note: Record<string, number>, from: number, span: number) =>
    note.start_time! >= from && note.start_time! < from + span;
  const clip = {
    id: "1",
    getProperty: vi.fn((prop: string) => REGION[prop]),
    call: vi.fn((method: string, ...args: unknown[]) => {
      if (method === "get_notes_extended") {
        const [, , from, span] = args as number[];

        return JSON.stringify({
          notes: held.filter((note) => inSpan(note, from!, span!)),
        });
      }

      if (method === "remove_notes_extended") {
        const [, , from, span] = args as number[];

        const kept = held.filter((note) => !inSpan(note, from!, span!));

        held.splice(0, held.length, ...kept);
      }

      if (method === "add_new_notes") {
        held.push(
          ...(args[0] as { notes: Array<Record<string, number>> }).notes,
        );
      }

      return "[]";
    }),
  } as unknown as LiveAPI;

  return { clip, held };
}

/**
 * @param held - The clip's notes
 * @returns The pitches still held, sorted
 */
function pitchesHeld(held: Array<Record<string, number>>): number[] {
  return held.map((note) => note.pitch!).toSorted((a, b) => a - b);
}

describe("a note past loop_end on a looping clip", () => {
  it("is not counted", () => {
    expect(getClipNoteCount(makeLoopingClip().clip)).toBe(1);
  });

  it("survives a transform", () => {
    const { clip, held } = makeLoopingClip();

    applyTransformsToExistingNotes(
      clip,
      newClipReasons(),
      undefined,
      "duration = legato()",
      4,
      4,
      CONTEXT,
    );

    expect(pitchesHeld(held)).toStrictEqual([60, 64]);
    expect(held.find((note) => note.pitch === 64)).toStrictEqual(PAST_LOOP_END);
  });

  it("survives a delete of every note", () => {
    const { clip, held } = makeLoopingClip();

    applyTransformsToExistingNotes(
      clip,
      newClipReasons(),
      "v0",
      undefined,
      4,
      4,
      CONTEXT,
    );

    expect(pitchesHeld(held)).toStrictEqual([64]);
  });

  it("survives a notes write that merges into the clip", () => {
    const { clip, held } = makeLoopingClip();

    handleNoteUpdates(
      clip,
      newClipReasons(),
      "E3 1|2",
      undefined,
      undefined,
      4,
      4,
      CONTEXT,
      undefined,
    );

    expect(pitchesHeld(held)).toStrictEqual([60, 64, 64]);
    expect(held.filter((note) => note.pitch === 64)).toContainEqual(
      expect.objectContaining({ start_time: 10 }),
    );
  });

  it("survives a code rewrite", () => {
    const { clip, held } = makeLoopingClip();

    applyNotesToClip(clip, []);

    expect(pitchesHeld(held)).toStrictEqual([64]);
  });
});
