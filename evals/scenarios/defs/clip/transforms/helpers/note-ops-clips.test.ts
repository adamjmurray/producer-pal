// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { formatNotation } from "#src/notation/barbeat/barbeat-format-notation.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  type EvalAssertion,
  type EvalTurnResult,
  type StateAssertion,
} from "../../../../types.ts";
import {
  ARRANGEMENT_HELD,
  DRUM_CLIP,
  drumLanesMerged,
  heldNoteCut,
  LEAD_CLIP,
  leadNotesRolled,
  notesEchoedAnEighthLater,
  SESSION_HELD,
} from "./note-ops-clips.ts";

const note = (pitch: number, start: number, duration: number): NoteEvent => ({
  pitch,
  start_time: start,
  duration,
  velocity: 100,
});

/** A read-clip result holding these notes. */
const readBack = (notes: NoteEvent[], length = "2bar") => ({
  notes: formatNotation(notes, { beatsPerBar: 4 }),
  timeSignature: "4/4",
  length,
});

const asState = (a: EvalAssertion): StateAssertion => a as StateAssertion;

const passes = (a: EvalAssertion, result: unknown): boolean =>
  (asState(a).expect as (r: unknown) => boolean)(result);

const createdTurns = (id: string, turn: number): EvalTurnResult[] =>
  Array.from({ length: turn + 1 }, (_, i) => ({
    turnIndex: i,
    userMessage: "",
    assistantResponse: "",
    toolCalls:
      i === turn
        ? [
            {
              name: "ppal-create-clip",
              args: {},
              result: JSON.stringify({ id, path: "t3/s0" }),
            },
          ]
        : [],
    durationMs: 0,
  }));

describe("fixtures", () => {
  it("match the Live Set spec", () => {
    expect(DRUM_CLIP).toHaveLength(32);
    expect(LEAD_CLIP).toHaveLength(12);
  });
});

describe("drumLanesMerged", () => {
  const lanes = [note(36, 0, 7.25), note(44, 0, 8), note(40, 1, 6.25)];

  it("passes one note per lane over the original span", () => {
    expect(passes(drumLanesMerged(), readBack(lanes))).toBe(true);
  });

  it("fails an unchanged clip", () => {
    expect(passes(drumLanesMerged(), readBack(DRUM_CLIP))).toBe(false);
  });

  it("explains an empty clip", () => {
    const { explain } = asState(drumLanesMerged());

    expect(explain?.({ timeSignature: "4/4" })).toBe("the clip has no notes");
  });
});

describe("leadNotesRolled", () => {
  const rolled = LEAD_CLIP.flatMap((n) =>
    [0, 1, 2, 3].map((i) =>
      note(n.pitch, n.start_time + (i * n.duration) / 4, n.duration / 4),
    ),
  );

  it("passes four equal sub-notes per note", () => {
    expect(passes(leadNotesRolled(), readBack(rolled))).toBe(true);
  });

  it("fails an unchanged clip", () => {
    expect(passes(leadNotesRolled(), readBack(LEAD_CLIP))).toBe(false);
  });
});

describe("notesEchoedAnEighthLater", () => {
  const originals = [60, 64, 67, 71].map((p, i) => note(p, i, 1));
  const echoes = originals.map((n) => note(n.pitch, n.start_time + 0.5, 1));
  const echoed = [...originals, ...echoes];

  it("passes originals plus echoes in a clip that kept its length", () => {
    expect(passes(notesEchoedAnEighthLater(1), readBack(echoed))).toBe(true);
  });

  it("fails when the clip got longer", () => {
    const longer = readBack(echoed, "4bar");

    expect(passes(notesEchoedAnEighthLater(1), longer)).toBe(false);
  });

  it("reads the clip the model created", () => {
    const { args } = asState(notesEchoedAnEighthLater(1));

    expect(
      (args as (t: EvalTurnResult[]) => unknown)(createdTurns("clip-7", 1)),
    ).toStrictEqual({ id: "clip-7", include: ["notes", "timing"] });
  });
});

describe("heldNoteCut", () => {
  it("passes the arrangement clip cut at its bars", () => {
    const cut = [note(48, 0, 8), note(48, 8, 4), note(48, 12, 4)];
    const result = readBack(cut, "4bar");

    expect(passes(heldNoteCut(1, ARRANGEMENT_HELD), result)).toBe(true);
  });

  it("passes the session clip cut at beat 3 and bar 2", () => {
    const cut = [note(60, 0, 2), note(60, 2, 2), note(60, 4, 4)];

    expect(passes(heldNoteCut(3, SESSION_HELD), readBack(cut))).toBe(true);
  });

  it("fails a clip-relative cut where an arrangement cut was asked", () => {
    const cut = [note(48, 0, 2), note(48, 2, 2), note(48, 4, 12)];
    const result = readBack(cut, "4bar");

    expect(passes(heldNoteCut(1, ARRANGEMENT_HELD), result)).toBe(false);
  });
});
