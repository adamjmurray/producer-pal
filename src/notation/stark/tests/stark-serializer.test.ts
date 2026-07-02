// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";
import { formatNotation } from "#src/notation/stark/stark-serializer.ts";
import { type NoteEvent } from "#src/notation/types.ts";

function note(
  pitch: number,
  start_time: number,
  duration: number,
  velocity = 100,
): NoteEvent {
  return { pitch, start_time, duration, velocity, probability: 1 };
}

function bucket(velocity: number): "soft" | "normal" | "accent" {
  if (velocity < 90) return "soft";
  if (velocity >= 112) return "accent";

  return "normal";
}

const DRUM = { drumMode: true } as const;

describe("stark serializer — empty input", () => {
  it("returns '' for zero notes", () => {
    expect(formatNotation([])).toBe("");
  });
});

describe("stark serializer — drum lines (drumMode)", () => {
  it("four-on-the-floor uses the /4 default (no header /N)", () => {
    const line = formatNotation(
      [note(36, 0, 1), note(36, 1, 1), note(36, 2, 1), note(36, 3, 1)],
      DRUM,
    );

    expect(line).toBe("kick: X X X X");
  });

  it("backbeat snare emits z rests between hits", () => {
    expect(formatNotation([note(38, 1, 1), note(38, 3, 1)], DRUM)).toBe(
      "snare: z X z X",
    );
  });

  it("a single hit serializes to one token", () => {
    expect(formatNotation([note(36, 0, 1)], DRUM)).toBe("kick: X");
  });

  it("half-note spacing fills the gap with a quarter rest", () => {
    expect(formatNotation([note(36, 0, 1), note(36, 2, 1)], DRUM)).toBe(
      "kick: X z X",
    );
  });

  it("eighth-note hits on the offbeats factor /8 into the header", () => {
    const line = formatNotation(
      [
        note(42, 0.5, 0.5),
        note(42, 1.5, 0.5),
        note(42, 2.5, 0.5),
        note(42, 3.5, 0.5),
      ],
      DRUM,
    );

    expect(line).toBe("hihat /8: z X z X z X z X");
  });

  it("adjacent sixteenth hits factor /16 into the header", () => {
    expect(
      formatNotation([note(36, 0, 0.25), note(36, 0.25, 0.25)], DRUM),
    ).toBe("kick /16: X X");
  });

  it("a per-hit duration different from the line default keeps its /N", () => {
    expect(
      formatNotation(
        [note(36, 0, 1), note(36, 1, 0.5), note(36, 1.5, 1)],
        DRUM,
      ),
    ).toBe("kick: X X/8 X");
  });

  it("on a duration tie the coarser note value wins the line default", () => {
    // two /16 then two /8 (equal counts) → /8 (coarser) becomes the default.
    const line = formatNotation(
      [
        note(36, 0, 0.25),
        note(36, 0.25, 0.25),
        note(36, 0.5, 0.5),
        note(36, 1, 0.5),
      ],
      DRUM,
    );

    expect(line).toBe("kick /8: X/16 X/16 X X");
  });

  it("velocity buckets map to ^ / X / x", () => {
    const line = formatNotation(
      [note(36, 0, 1, 120), note(36, 1, 1, 100), note(36, 2, 1, 70)],
      DRUM,
    );

    expect(line).toBe("kick: ^ X x");
  });

  it("an unmapped pad serializes as an absolute pitch-name header (C3=60)", () => {
    expect(formatNotation([note(60, 0, 1)], DRUM)).toBe("C3: X");
  });

  it("one line per pitch, first-seen order (no trailing rest padding)", () => {
    const out = formatNotation(
      [note(36, 0, 1), note(38, 1, 1), note(36, 2, 1), note(38, 3, 1)],
      DRUM,
    );

    // Each line stops at its own last onset: kick's is beat 2 (X z X), snare's
    // is beat 3 (z X z X). Trailing rests are not padded.
    expect(out).toBe("kick: X z X\nsnare: z X z X");
  });
});

describe("stark serializer — pitched lines (line-default factoring)", () => {
  it("a single quarter melody note omits the /4 default", () => {
    expect(formatNotation([note(60, 0, 1)])).toBe("melody: C");
  });

  it("an all-eighth melody factors /8 into the header", () => {
    const line = formatNotation([
      note(60, 0, 0.5),
      note(62, 0.5, 0.5),
      note(64, 1, 0.5),
    ]);

    expect(line).toBe("melody /8: C D E");
  });

  it("a duration tie with the line default keeps the default (header omitted)", () => {
    const line = formatNotation([
      note(60, 0, 1),
      note(62, 1, 1),
      note(64, 2, 0.5),
      note(65, 2.5, 0.5),
    ]);

    expect(line).toBe("melody: C D E/8 F/8");
  });
});

describe("round-trip (interpret → serialize → interpret)", () => {
  function roundTrip(
    stark: string,
    drumMode = false,
  ): { first: NoteEvent[]; second: NoteEvent[] } {
    const first = interpretNotation(stark);
    const second = interpretNotation(formatNotation(first, { drumMode }));

    return { first, second };
  }

  // Both drum and pitched lines are a fixed point on pitch / start / duration
  // (modulo the velocity bucket) — drums share the pitched timing model.
  function expectStableNotes(first: NoteEvent[], second: NoteEvent[]): void {
    expect(second).toHaveLength(first.length);

    for (const [i, a] of first.entries()) {
      const b = second[i] as NoteEvent;

      expect(b.pitch).toBe(a.pitch);
      expect(b.start_time).toBeCloseTo(a.start_time, 6);
      expect(b.duration).toBeCloseTo(a.duration, 6);
      expect(bucket(b.velocity)).toBe(bucket(a.velocity));
    }
  }

  it("melody with varied durations and octaves", () => {
    const { first, second } = roundTrip("melody: C/4 Eb/8 G'/2 C''/16");

    expectStableNotes(first, second);
  });

  it("melody with rests (gap fill)", () => {
    const { first, second } = roundTrip("melody: C/4 z/4 D/4 z/2 E/4");

    expectStableNotes(first, second);
  });

  it("melody with a multi-beat gap decomposes rests greedily", () => {
    const { first, second } = roundTrip("melody: C z/2 z/4 E");

    expectStableNotes(first, second);
  });

  it("bass line in low register (incl. C1=36, the kick pitch)", () => {
    const { first, second } = roundTrip("bass: C/4 G,/4 C/2");

    expectStableNotes(first, second);
    expect(first[0]?.pitch).toBe(36);
  });

  it("chords preserve simultaneous notes", () => {
    const { first, second } = roundTrip("chords: [C Eb G]/2! [D F A]/2");

    expectStableNotes(first, second);
  });

  it("whole-note chords use the /1 default", () => {
    const { first, second } = roundTrip("chords: [C E G] [D F A]");

    expectStableNotes(first, second);
  });

  it("four-on-the-floor drums (duration round-trips)", () => {
    const { first, second } = roundTrip("kick: X X X X", true);

    expectStableNotes(first, second);
    expect(first.every((n) => n.duration === 1)).toBe(true);
  });

  it("backbeat with rests", () => {
    const { first, second } = roundTrip("snare: z X z X", true);

    expectStableNotes(first, second);
  });

  it("eighth-note hats via header /N", () => {
    const { first, second } = roundTrip("hihat /8: z X z X z X z X", true);

    expectStableNotes(first, second);
    expect(first.every((n) => n.duration === 0.5)).toBe(true);
  });

  it("glued inline /N round-trips the mixed durations", () => {
    const { first, second } = roundTrip("kick: X X/8 X", true);

    expectStableNotes(first, second);
    expect(first.map((n) => n.duration)).toStrictEqual([1, 0.5, 1]);
  });

  it("all hit types (accent / normal / soft)", () => {
    const { first, second } = roundTrip("kick: ^ X x X", true);

    expectStableNotes(first, second);
  });

  it("hats alias resolves to hihat (MIDI 42)", () => {
    const { first, second } = roundTrip("hats: X X", true);

    expectStableNotes(first, second);
    expect(first.every((n) => n.pitch === 42)).toBe(true);
  });

  it("multiple drum lines round-trip together", () => {
    const { first, second } = roundTrip("kick: X z X z\nsnare: z X z X", true);

    expectStableNotes(first, second);
  });

  it("pitch-name drum line (unmapped pad) round-trips", () => {
    const { first, second } = roundTrip("C3: X z X z", true);

    expectStableNotes(first, second);
    expect(first[0]?.pitch).toBe(60);
  });

  it("sixteenth-note drums round-trip on the /16 grid", () => {
    const { first, second } = roundTrip("hihat /16: X X X X X X X X", true);

    expectStableNotes(first, second);
  });
});
