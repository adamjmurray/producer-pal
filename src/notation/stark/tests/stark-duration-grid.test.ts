// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  durationEntry,
  restNoteValues,
} from "#src/notation/stark/helpers/stark-duration-grid.ts";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";
import { formatNotation } from "#src/notation/stark/stark-serializer.ts";

describe("stark duration grid — durationEntry", () => {
  it("appends a dot for a dotted note value", () => {
    expect(durationEntry({ n: 4, dotted: true, triplet: false }).token).toBe(
      "4.",
    );
  });

  it("appends a t for a triplet note value", () => {
    expect(durationEntry({ n: 4, dotted: false, triplet: true }).token).toBe(
      "4t",
    );
  });

  it("uses a bare N for a plain note value", () => {
    expect(durationEntry({ n: 4, dotted: false, triplet: false }).token).toBe(
      "4",
    );
  });
});

/**
 * Total length of the rests that fill a gap.
 * @param gapBeats - Gap length in beats
 * @returns Sum of the rest lengths
 */
function restTotal(gapBeats: number): number {
  return restNoteValues(gapBeats).reduce((sum, rest) => sum + rest.beats, 0);
}

describe("stark duration grid — restNoteValues", () => {
  it("fills a triplet-to-straight gap exactly", () => {
    // A 16th at 0 and the next hit on a quarter triplet: 2/3 - 1/4 = 5/12.
    expect(restNoteValues(5 / 12).map((rest) => rest.token)).toStrictEqual([
      "16",
      "16t",
    ]);
    expect(restTotal(5 / 12)).toBeCloseTo(5 / 12, 9);
  });

  it.each([5 / 12, 7 / 12, 13 / 12, 2.75, 5, 13.5, 40 + 5 / 12])(
    "fills a %f-beat gap with nothing left over",
    (gap) => {
      expect(restTotal(gap)).toBeCloseTo(gap, 9);
    },
  );

  it("spells grid gaps with the largest values first", () => {
    expect(restNoteValues(5).map((rest) => rest.token)).toStrictEqual([
      "1",
      "4",
    ]);
    expect(restNoteValues(13).map((rest) => rest.token)).toStrictEqual([
      "1.",
      "1.",
      "4",
    ]);
  });

  it("drops only what no note value can spell", () => {
    expect(restNoteValues(0.1)).toStrictEqual([]);
    expect(restTotal(0.3)).toBe(0.25);
  });

  it("keeps on-beat drum hits on the beat after a triplet hit", () => {
    const starts = [0, 2 / 3, 1, 5 / 3, 2, 3, 4];
    const notes = starts.map((start_time) => ({
      pitch: 42,
      start_time,
      duration: 0.25,
      velocity: 100,
      probability: 1,
    }));
    const back = interpretNotation(formatNotation(notes, { drumMode: true }));

    expect(back).toHaveLength(starts.length);

    for (const [i, start] of starts.entries()) {
      expect(back[i]!.start_time).toBeCloseTo(start, 9);
    }
  });
});
