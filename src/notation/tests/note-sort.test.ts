// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { dedupeNotesKeepingLast, isSameSlot } from "../note-sort.ts";

// SAME_TIME_EPSILON is 0.001. The boundary is what the three callers must agree
// on, so it is pinned here rather than in each of them.
describe("isSameSlot()", () => {
  it("matches the same pitch at the same onset", () => {
    expect(
      isSameSlot({ pitch: 60, start_time: 1 }, { pitch: 60, start_time: 1 }),
    ).toBe(true);
  });

  it("does not match a different pitch at the same onset", () => {
    expect(
      isSameSlot({ pitch: 60, start_time: 1 }, { pitch: 61, start_time: 1 }),
    ).toBe(false);
  });

  it("matches onsets closer than the epsilon (round-trip drift)", () => {
    expect(
      isSameSlot(
        { pitch: 60, start_time: 0 },
        { pitch: 60, start_time: 0.0009 },
      ),
    ).toBe(true);
  });

  it("does not match onsets exactly the epsilon apart", () => {
    // Exclusive boundary: 0.001 apart is two different slots.
    expect(
      isSameSlot(
        { pitch: 60, start_time: 0 },
        { pitch: 60, start_time: 0.001 },
      ),
    ).toBe(false);
  });

  it("is symmetric, so caller argument order never matters", () => {
    const a = { pitch: 60, start_time: 0 };
    const b = { pitch: 60, start_time: 0.0009 };

    expect(isSameSlot(a, b)).toBe(isSameSlot(b, a));
    expect(isSameSlot({ pitch: 60, start_time: -1 }, a)).toBe(
      isSameSlot(a, { pitch: 60, start_time: -1 }),
    );
  });
});

type Slot = { id: number; start_time: number; pitch: number };

// The original per-note filter, kept as the oracle for the fast version.
function dedupeReference(notes: Slot[]): Slot[] {
  return notes.reduce<Slot[]>((result, note) => {
    const kept = result.filter((existing) => !isSameSlot(existing, note));

    kept.push(note);

    return kept;
  }, []);
}

// Small seeded generator (mulberry32) so failures reproduce.
function seededRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;

    let t = Math.imul(state ^ (state >>> 15), 1 | state);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNotes(seed: number, count: number): Slot[] {
  const random = seededRandom(seed);
  const odd = [Number.NaN, Infinity, -Infinity];

  return Array.from({ length: count }, (_, id) => {
    // Onsets on a 0.0004 grid, so chains of neighbours sit inside and outside
    // the 0.001 tolerance (it isn't transitive).
    let start_time =
      Math.floor(random() * 12) * 0.0004 + (random() < 0.5 ? 0 : 1);
    let pitch = 60 + Math.floor(random() * 3);

    if (random() < 0.01) {
      start_time = odd[Math.floor(random() * 3)] as number;
    }

    if (random() < 0.01) {
      pitch = Number.NaN;
    }

    return { id, start_time, pitch };
  });
}

describe("dedupeNotesKeepingLast()", () => {
  it("keeps the last of each slot, in the original order", () => {
    const notes = [
      { id: 0, start_time: 0, pitch: 60 },
      { id: 1, start_time: 1, pitch: 60 },
      { id: 2, start_time: 0.0005, pitch: 60 },
      { id: 3, start_time: 0, pitch: 61 },
    ];

    expect(dedupeNotesKeepingLast(notes)).toStrictEqual([
      notes[1],
      notes[2],
      notes[3],
    ]);
  });

  it("matches the per-note filter on seeded random input", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const notes = randomNotes(seed, (seed * 7) % 60);

      expect(dedupeNotesKeepingLast(notes).map((n) => n.id)).toStrictEqual(
        dedupeReference(notes).map((n) => n.id),
      );
    }
  });

  it("handles a large clip of mostly distinct notes", () => {
    // Every 10th note restates the slot of the one before it.
    const notes = Array.from({ length: 20000 }, (_, id) => {
      const restates = id % 10 === 9;
      const base = restates ? id - 1 : id;

      return {
        id,
        start_time: base * 0.01 + (restates ? 0.0002 : 0),
        pitch: 60 + (base % 5),
      };
    });
    const result = dedupeNotesKeepingLast(notes);

    expect(result).toHaveLength(18000);
    expect(result.some((n) => n.id === 8)).toBe(false);
    expect(result.some((n) => n.id === 9)).toBe(true);
  });
});
