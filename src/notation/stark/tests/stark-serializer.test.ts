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
  it("four-on-the-floor collapses to X*4 on the /4 default (no header /N)", () => {
    const line = formatNotation(
      [note(36, 0, 1), note(36, 1, 1), note(36, 2, 1), note(36, 3, 1)],
      DRUM,
    );

    expect(line).toBe("kick: X*4");
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

  it("one line per pitch, ascending-pitch order (no trailing rest padding)", () => {
    // Snare (38) is seen BEFORE kick (36), but lines emit in ascending-pitch
    // order (kick then snare) — a canonical order independent of input order, so
    // re-serializing round-tripped notes reproduces the same line sequence.
    const out = formatNotation(
      [note(38, 1, 1), note(36, 0, 1), note(38, 3, 1), note(36, 2, 1)],
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

describe("stark serializer — off-grid durations preserve onsets", () => {
  it("an off-grid melody duration does not shift the following onset", () => {
    // 3.5 beats isn't a grid value; it ties between /2. (3) and /1 (4) and snaps
    // DOWN to /2.. The serializer advances by EMITTED grid-time (not the real 3.5)
    // so D stays anchored at 3.5 via a compensating /8 rest — a -0.5 error must
    // not cascade onto D. (2.5 is no longer off-grid-ambiguous: it now snaps to
    // the /1t triplet, so a plain tie needs a value with no triplet neighbor.)
    const out = formatNotation([note(60, 0, 3.5), note(62, 3.5, 1)]);

    expect(out).toBe("melody: C/2. z/8 D");

    const back = interpretNotation(out);

    // Onsets preserved exactly; only C's own sustain snaps 3.5 → 3.
    expect(back.map((n) => n.start_time)).toStrictEqual([0, 3.5]);
    expect(back.map((n) => n.duration)).toStrictEqual([3, 1]);
  });

  it("an off-grid drum duration stays anchored across the rest of the line", () => {
    // kick at 0 (dur 3.5), 3.5, 4.5. The 3.5-beat hit snaps to /2. but a
    // compensating /8 rest keeps every later onset in place.
    const out = formatNotation(
      [note(36, 0, 3.5), note(36, 3.5, 1), note(36, 4.5, 1)],
      DRUM,
    );

    expect(out).toBe("kick: X/2. z/8 X X");

    const back = interpretNotation(out);

    expect(back.map((n) => n.start_time)).toStrictEqual([0, 3.5, 4.5]);
  });
});

describe("stark serializer — overlapping notes trim to legato, onsets preserved", () => {
  it("a held bass under an 8th-note melody does not shift the melody's onsets", () => {
    // C3 held a whole note under an E-F-G-A run of 8ths. The single-line model
    // can't sustain the bass under the melody, but its overlap must NOT push the
    // melody's onsets late (the bug: the 4-beat bass advanced the cursor past
    // every 8th, so F/G/A drifted to beats 4/4.5/5). The bass is trimmed to the
    // gap before the next onset instead; every onset stays exact.
    const out = formatNotation([
      note(48, 0, 4),
      note(64, 0, 0.5),
      note(65, 0.5, 0.5),
      note(67, 1, 0.5),
      note(69, 1.5, 0.5),
    ]);

    const back = interpretNotation(out);

    expect(back.map((n) => n.start_time)).toStrictEqual([0, 0, 0.5, 1, 1.5]);
    // Pitches survive; the bass (grouped with E at the shared onset) is trimmed
    // to the 8th that precedes the next onset rather than held for 4 beats.
    expect(back.map((n) => n.pitch)).toStrictEqual([48, 64, 65, 67, 69]);
  });

  it("an overlapping melody note is trimmed so the next onset stays put", () => {
    // C sustains 2 beats but D starts at beat 1 — a 1-beat overlap. C is trimmed
    // to a quarter so D lands on beat 1, not beat 2.
    const out = formatNotation([note(60, 0, 2), note(62, 1, 1)]);

    expect(out).toBe("melody: C D");

    const back = interpretNotation(out);

    expect(back.map((n) => n.start_time)).toStrictEqual([0, 1]);
    expect(back.map((n) => n.duration)).toStrictEqual([1, 1]);
  });

  it("overlapping same-pitch drum hits keep their onsets", () => {
    // Two kicks a 16th apart, each ringing a full beat (a 0.75-beat overlap). The
    // first is trimmed to the /16 that fits the gap, so the second hit stays on
    // beat 0.25 rather than sliding to beat 1.
    const out = formatNotation([note(36, 0, 1), note(36, 0.25, 1)], DRUM);

    const back = interpretNotation(out);

    expect(back.map((n) => n.start_time)).toStrictEqual([0, 0.25]);
  });
});

describe("stark serializer — warns when a note is too long to spell", () => {
  it("warns and truncates a note longer than the 6-beat grid maximum", () => {
    // 8 beats (two 4/4 bars) exceeds Stark's coarsest value (/1. = 6 beats) and
    // there is no tie token, so the note snaps to 6 and reads back short. That
    // loss is the note's own tail (no rest can restore it), so it must warn.
    const out = formatNotation([note(60, 0, 8)]);
    const back = interpretNotation(out);

    expect(back.map((n) => n.duration)).toStrictEqual([6]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("longer than 6 beats"),
    );
  });

  it("does not warn when every note fits the grid (a 6-beat note is exact)", () => {
    formatNotation([note(60, 0, 6), note(62, 6, 2)]);

    expect(outlet).not.toHaveBeenCalled();
  });

  it("does not warn for a long note trimmed by legato overlap, not the ceiling", () => {
    // The first note's raw sustain is 8 beats (> 6), but the next onset is only 2
    // beats away, so legatoDuration trims it to a 2-beat gap — a compensated
    // overlap trim, NOT a ceiling clip. Warning "shortened to 6 beats" here would
    // misattribute the loss (the old flat scan of raw durations did exactly that).
    const out = formatNotation([note(60, 0, 8), note(62, 2, 1)]);

    expect(interpretNotation(out).map((n) => n.start_time)).toStrictEqual([
      0, 2,
    ]);
    expect(outlet).not.toHaveBeenCalled();
  });

  it("uses the plural noun and warns once for multiple overlong notes", () => {
    formatNotation([note(60, 0, 8), note(62, 8, 7)]);

    expect(outlet).toHaveBeenCalledTimes(1);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("2 notes longer than 6 beats"),
    );
  });

  it("counts a ceiling clip on a drum line", () => {
    // Drum lines walk a separate token path from pitched lines, so the tally has
    // to happen there too: an 8-beat kick with nothing after it snaps to 6.
    const out = formatNotation([note(36, 0, 8)], DRUM);

    expect(out).toBe("kick /1.: X");
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("longer than 6 beats"),
    );
  });

  it("counts a ceiling clip when the overlong note is a *N repeat group", () => {
    // Three identical 8-beat notes, each spaced far enough apart that the cap
    // stays above the 6-beat grid, collapse into a single repeat group. The
    // repeat-emission path must still tally the ceiling clip and warn.
    formatNotation([note(60, 0, 8), note(60, 8, 8), note(60, 16, 8)]);

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("longer than 6 beats"),
    );
  });
});

describe("stark serializer — dotted durations round-trip exactly", () => {
  it("a dotted-quarter melody note round-trips losslessly", () => {
    // 1.5 beats is now the grid value /4. — emitted exactly, no compensating rest.
    const out = formatNotation([note(60, 0, 1.5), note(62, 1.5, 1)]);

    expect(out).toBe("melody: C/4. D");

    const back = interpretNotation(out);

    expect(back.map((n) => n.start_time)).toStrictEqual([0, 1.5]);
    expect(back.map((n) => n.duration)).toStrictEqual([1.5, 1]);
  });

  it("factors a dotted value into the line-default header", () => {
    // A line of dotted quarters picks /4. as the line default, dropping it from
    // every token onto the header.
    const out = formatNotation([
      note(60, 0, 1.5),
      note(62, 1.5, 1.5),
      note(64, 3, 1.5),
    ]);

    expect(out).toBe("melody /4.: C D E");
    expect(interpretNotation(out).map((n) => n.duration)).toStrictEqual([
      1.5, 1.5, 1.5,
    ]);
  });

  it("emits a single dotted rest for a 1.5-beat gap", () => {
    // The gap fill uses the same dotted grid: 1.5 beats → one z/4., not z z/8.
    const out = formatNotation([note(60, 0, 1), note(62, 2.5, 1)]);

    expect(out).toBe("melody: C z/4. D");
    expect(interpretNotation(out).map((n) => n.start_time)).toStrictEqual([
      0, 2.5,
    ]);
  });

  it("round-trips a dotted bracket chord and a dotted drum hit", () => {
    // Median 52 ≥ 48 → a melody line; simultaneous notes serialize as a [..] stack.
    const chord = formatNotation([note(48, 0, 3), note(52, 0, 3)]);

    expect(chord).toBe("melody /2.: [C, E,]");

    const drum = formatNotation(
      [note(36, 0, 0.75), note(36, 0.75, 0.75)],
      DRUM,
    );

    expect(drum).toBe("kick /8.: X X");
    expect(interpretNotation(drum).map((n) => n.start_time)).toStrictEqual([
      0, 0.75,
    ]);
  });
});

describe("stark serializer — triplet durations round-trip exactly", () => {
  it("an eighth-note-triplet melody note round-trips losslessly", () => {
    // 1/3 beat is now the grid value /8t — emitted exactly, no compensating rest.
    const out = formatNotation([note(60, 0, 1 / 3), note(62, 1 / 3, 1)]);

    expect(out).toBe("melody: C/8t D");

    const back = interpretNotation(out);

    expect(back.map((n) => n.start_time)).toStrictEqual([0, 1 / 3]);
    expect(back.map((n) => n.duration)).toStrictEqual([1 / 3, 1]);
  });

  it("factors a triplet value into the line-default header", () => {
    // Three eighth-note triplets fill one beat; the line picks /8t as the default
    // and drops it from every token onto the header.
    const out = formatNotation([
      note(60, 0, 1 / 3),
      note(62, 1 / 3, 1 / 3),
      note(64, 2 / 3, 1 / 3),
    ]);

    expect(out).toBe("melody /8t: C D E");
    expect(interpretNotation(out).map((n) => n.duration)).toStrictEqual([
      1 / 3,
      1 / 3,
      1 / 3,
    ]);
  });

  it("emits a single triplet rest for a 1/3-beat gap", () => {
    // The gap fill uses the same triplet grid: 1/3 beat → one z/8t, not z/16 + drop.
    const out = formatNotation([note(60, 0, 1), note(62, 1 + 1 / 3, 1)]);

    expect(out).toBe("melody: C z/8t D");
    expect(interpretNotation(out).map((n) => n.start_time)).toStrictEqual([
      0,
      1 + 1 / 3,
    ]);
  });

  it("round-trips a triplet bracket chord and a triplet drum hit", () => {
    // Median 52 ≥ 48 → a melody line; simultaneous notes serialize as a [..] stack.
    const chord = formatNotation([note(48, 0, 2 / 3), note(52, 0, 2 / 3)]);

    expect(chord).toBe("melody /4t: [C, E,]");

    const drum = formatNotation(
      [note(36, 0, 1 / 3), note(36, 1 / 3, 1 / 3)],
      DRUM,
    );

    expect(drum).toBe("kick /8t: X X");
    expect(interpretNotation(drum).map((n) => n.start_time)).toStrictEqual([
      0,
      1 / 3,
    ]);
  });
});

describe("stark serializer — repeat emission (*N)", () => {
  it("collapses a 16th-note roll to X*16 on the /16 header default", () => {
    const roll = Array.from({ length: 16 }, (_unused, i) =>
      note(42, i * 0.25, 0.25),
    );

    expect(formatNotation(roll, DRUM)).toBe("hihat /16: X*16");
  });

  it("collapses repeated melody notes into note*N (default omitted)", () => {
    const line = formatNotation([
      note(60, 0, 1),
      note(60, 1, 1),
      note(60, 2, 1),
      note(60, 3, 1),
    ]);

    expect(line).toBe("melody: C*4");
  });

  it("collapses repeated bracket chords into [notes]*N", () => {
    const line = formatNotation([
      note(48, 0, 1),
      note(52, 0, 1),
      note(55, 0, 1),
      note(48, 1, 1),
      note(52, 1, 1),
      note(55, 1, 1),
      note(48, 2, 1),
      note(52, 2, 1),
      note(55, 2, 1),
    ]);

    expect(line).toBe("melody: [C, E, G,]*3");
  });

  it("a run of three hits collapses (the emit threshold)", () => {
    expect(
      formatNotation([note(36, 0, 1), note(36, 1, 1), note(36, 2, 1)], DRUM),
    ).toBe("kick: X*3");
  });

  it("a run of exactly two stays literal (below the *N threshold)", () => {
    expect(formatNotation([note(36, 0, 1), note(36, 1, 1)], DRUM)).toBe(
      "kick: X X",
    );
  });

  it("collapses only the identical run, leaving a differing token literal", () => {
    // three normal kicks then a soft one — the glyph change breaks the run.
    const line = formatNotation(
      [note(36, 0, 1), note(36, 1, 1), note(36, 2, 1), note(36, 3, 1, 70)],
      DRUM,
    );

    expect(line).toBe("kick: X*3 x");
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

  it("bracket chords preserve simultaneous notes", () => {
    const { first, second } = roundTrip("melody: [C Eb G]/2! [D F A]/2");

    expectStableNotes(first, second);
  });

  it("chord symbols realize to notes that round-trip", () => {
    // Chord symbols are input-only sugar; read-back is literal notes on a
    // melody/bass line, never a chords: line.
    const { first, second } = roundTrip("chords: C G");

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

  it("a *N roll round-trips through the compact form", () => {
    // Interpret expands X*16 to 16 hits; serialize re-collapses to X*16.
    const { first, second } = roundTrip("hihat /16: X*16", true);

    expectStableNotes(first, second);
    expect(first).toHaveLength(16);
    expect(formatNotation(first, { drumMode: true })).toBe("hihat /16: X*16");
  });
});

describe("stark serializer — input note ordering", () => {
  it("sorts notes by start time, so a shuffled input serializes identically", () => {
    // Live API note lists are not guaranteed to arrive in start-time order, so
    // the serializer sorts them itself. The same four on-grid hits fed out of
    // order must still collapse to X*4 — not a mis-walk of leading rests.
    const shuffled = [
      note(36, 2, 1),
      note(36, 0, 1),
      note(36, 3, 1),
      note(36, 1, 1),
    ];

    expect(formatNotation(shuffled, DRUM)).toBe("kick: X*4");
  });
});
