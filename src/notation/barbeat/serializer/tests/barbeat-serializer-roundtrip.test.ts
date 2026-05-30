// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { drumPatternNotes } from "../../barbeat-test-fixtures.ts";
import { interpretNotation } from "../../interpreter/barbeat-interpreter.ts";
import { formatNotation } from "../barbeat-serializer.ts";
import { expectRoundTripNotes as expectRoundTrip } from "./barbeat-serializer-test-helpers.ts";

describe("round-trip: serialize → parse → interpret", () => {
  it("round-trips simple melody", () => {
    expectRoundTrip([
      createNote(),
      createNote({ pitch: 62, start_time: 1 }),
      createNote({ pitch: 64, start_time: 2 }),
      createNote({ pitch: 65, start_time: 3 }),
    ] as NoteEvent[]);
  });

  it("round-trips a note before the clip start (negative time)", () => {
    // A pickup before 1|1 must serialize as a sub-1 beat in bar 1 (not bar 0)
    // so it parses back to the same negative start_time.
    expectRoundTrip([
      createNote({ pitch: 60, start_time: -1 / 3 }),
      createNote({ pitch: 62, start_time: 0 }),
      createNote({ pitch: 64, start_time: 2 }),
    ] as NoteEvent[]);
  });

  it("round-trips chord", () => {
    expectRoundTrip([
      createNote(),
      createNote({ pitch: 64 }),
      createNote({ pitch: 67 }),
    ] as NoteEvent[]);
  });

  it("round-trips chord progression", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 64, start_time: 0 }),
      createNote({ pitch: 67, start_time: 0 }),
      createNote({ pitch: 62, start_time: 1 }),
      createNote({ pitch: 65, start_time: 1 }),
      createNote({ pitch: 69, start_time: 1 }),
    ] as NoteEvent[]);
  });

  it("round-trips notes with velocity changes", () => {
    expectRoundTrip([
      createNote({ velocity: 80 }),
      createNote({ pitch: 62, start_time: 1, velocity: 120 }),
      createNote({ pitch: 64, start_time: 2, velocity: 60 }),
    ] as NoteEvent[]);
  });

  it("round-trips velocity range", () => {
    expectRoundTrip([
      createNote({ velocity: 80, velocity_deviation: 40 }),
      createNote({
        pitch: 62,
        start_time: 1,
        velocity: 60,
        velocity_deviation: 20,
      }),
    ] as NoteEvent[]);
  });

  it("round-trips duration changes", () => {
    expectRoundTrip([
      createNote({ duration: 0.5 }),
      createNote({ pitch: 62, start_time: 1, duration: 2 }),
      createNote({ pitch: 64, start_time: 2, duration: 0.25 }),
    ] as NoteEvent[]);
  });

  it("round-trips probability changes", () => {
    expectRoundTrip([
      createNote({ probability: 0.8 }),
      createNote({ pitch: 62, start_time: 1, probability: 0.5 }),
      createNote({ pitch: 64, start_time: 2, probability: 1.0 }),
    ] as NoteEvent[]);
  });

  it("round-trips mixed state changes", () => {
    expectRoundTrip([
      createNote({ velocity: 80, duration: 0.5, probability: 0.8 }),
      createNote({
        pitch: 62,
        start_time: 1,
        velocity: 120,
        duration: 2,
        probability: 0.6,
      }),
    ] as NoteEvent[]);
  });

  it("round-trips sub-beat timing", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 62, start_time: 0.5 }),
      createNote({ pitch: 64, start_time: 1.25 }),
      createNote({ pitch: 65, start_time: 1.75 }),
    ] as NoteEvent[]);
  });

  it("round-trips comma-merged notes", () => {
    // Same note at beats 1 and 3 — gets comma-merged in output
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ start_time: 2 }),
    ] as NoteEvent[]);
  });

  it("round-trips comma-merged chords", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 64, start_time: 0 }),
      createNote({ pitch: 67, start_time: 0 }),
      createNote({ start_time: 2 }),
      createNote({ pitch: 64, start_time: 2 }),
      createNote({ pitch: 67, start_time: 2 }),
    ] as NoteEvent[]);
  });

  it("round-trips interleaved chord pattern", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 64, start_time: 0 }),
      createNote({ pitch: 62, start_time: 1 }),
      createNote({ pitch: 65, start_time: 1 }),
      createNote({ start_time: 2 }),
      createNote({ pitch: 64, start_time: 2 }),
      createNote({ pitch: 62, start_time: 3 }),
      createNote({ pitch: 65, start_time: 3 }),
    ] as NoteEvent[]);
  });

  it("round-trips notes across bars", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 62, start_time: 4 }),
      createNote({ pitch: 64, start_time: 8 }),
    ] as NoteEvent[]);
  });

  it("round-trips with 3/4 time signature", () => {
    expectRoundTrip(
      [
        createNote({ start_time: 0 }),
        createNote({ pitch: 62, start_time: 3 }),
      ] as NoteEvent[],
      { timeSigNumerator: 3, timeSigDenominator: 4 },
    );
  });

  it("round-trips with 6/8 time signature", () => {
    expectRoundTrip(
      [
        createNote({ start_time: 0 }),
        createNote({ pitch: 62, start_time: 1.5 }),
        createNote({ pitch: 64, start_time: 3 }),
      ] as NoteEvent[],
      { timeSigNumerator: 6, timeSigDenominator: 8 },
    );
  });

  it("round-trips drum pattern fixture", () => {
    expectRoundTrip(drumPatternNotes);
  });

  it("round-trips per-note velocity in chord", () => {
    expectRoundTrip([
      createNote({ velocity: 127 }),
      createNote({ pitch: 64, velocity: 100 }),
      createNote({ pitch: 67, velocity: 80 }),
    ] as NoteEvent[]);
  });

  it("round-trips all defaults (no state changes)", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ start_time: 1 }),
      createNote({ start_time: 2 }),
      createNote({ start_time: 3 }),
    ] as NoteEvent[]);
  });

  it("round-trips from notation string", () => {
    // n/2 = half note; n2/1 = 2 whole notes
    const original = "v80-120 n/2 C3 D3 1|2.25 v120 p0.8 n2/1 E3 F3 1|3";
    const parsed = interpretNotation(original);
    const formatted = formatNotation(parsed);
    const reparsed = interpretNotation(formatted);

    expect(parsed).toStrictEqual(reparsed);
  });

  it("round-trips triplet-based timing", () => {
    expectRoundTrip([
      createNote({ start_time: 0 }),
      createNote({ pitch: 62, start_time: 1 / 3 }),
      createNote({ pitch: 64, start_time: 2 / 3 }),
    ] as NoteEvent[]);
  });

  it("serializes triplet positions as ±n note-value offsets", () => {
    const formatted = formatNotation([
      createNote({ start_time: 0 }),
      createNote({ pitch: 62, start_time: 1 / 3 }),
      createNote({ pitch: 64, start_time: 2 / 3 }),
    ] as NoteEvent[]);

    // Non-dyadic positions use the offset form, not a lossy decimal
    expect(formatted).toContain("1|1+n/12");
    expect(formatted).toContain("1|1+n/6");
    expect(formatted).not.toContain("1.333");
  });

  it("round-trips triplet positions in 6/8 (meter-aware offsets)", () => {
    // In 6/8 a beat is an eighth (0.5 Ableton beats); an eighth triplet of the
    // beat is 1/6 of an Ableton beat.
    expectRoundTrip(
      [
        createNote({ start_time: 0 }),
        createNote({ pitch: 62, start_time: 1 / 6 }),
        createNote({ pitch: 64, start_time: 2 / 6 }),
      ] as NoteEvent[],
      { timeSigNumerator: 6, timeSigDenominator: 8 },
    );
  });

  it("round-trips sixteenth-note subdivisions", () => {
    expectRoundTrip([
      createNote({ duration: 0.25, start_time: 0 }),
      createNote({ duration: 0.25, start_time: 0.25 }),
      createNote({ duration: 0.25, start_time: 0.5 }),
      createNote({ duration: 0.25, start_time: 0.75 }),
    ] as NoteEvent[]);
  });

  // Fine and tuplet note durations used to snap to a lossy /64 because the note
  // duration serializer's denominator list was a strict subset of its siblings
  // (n/128 → n/64 doubled the duration on read → re-author). They now round-trip
  // exactly. Durations are meter-invariant in Ableton beats, so the same values
  // are exercised across meters. (Drum @step shares formatAbsoluteDuration, which
  // is unit-tested directly in barbeat-serializer-fractions.test.ts.)
  const FINE_DURATIONS_AB = [
    4 / 128, // n/128
    4 / 256, // n/256
    4 / 48, // n/48 (triplet 32nd)
    4 / 96, // n/96
    4 / 40, // n/40 (quintuplet 32nd)
    4 / 7, // n/7 (septuplet whole)
  ];

  it.each([
    ["4/4", 4, 4],
    ["6/8", 6, 8],
    ["2/2", 2, 2],
  ])("round-trips fine/tuplet note durations in %s", (_label, num, den) => {
    expectRoundTrip(
      FINE_DURATIONS_AB.map((duration, i) =>
        createNote({ pitch: 60 + i, start_time: i, duration }),
      ) as NoteEvent[],
      { timeSigNumerator: num, timeSigDenominator: den },
    );
  });

  it("round-trips negative (pre-downbeat) tuplet and dyadic positions", () => {
    // A note before 1|1 serializes as `1|1-n<fraction>`; the value<1 branch must
    // be as lossless as the value≥1 branch for clean note-value offsets (F5).
    expectRoundTrip([
      createNote({ pitch: 60, start_time: -1 / 3 }), // 1|1-n/12
      createNote({ pitch: 62, start_time: -1 / 6 }), // 1|1-n/24
      createNote({ pitch: 64, start_time: -1 / 12 }), // 1|1-n/48
      createNote({ pitch: 65, start_time: -0.5 }), // 1|1-n/8
      createNote({ pitch: 67, start_time: 0 }),
    ] as NoteEvent[]);
  });
});
