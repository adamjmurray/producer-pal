// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { formatMidiJson, interpretMidiJson } from "./midi-json-notation.ts";

describe("interpretMidiJson", () => {
  it("parses a JSON array into note events (4/4: musical beats == Ableton beats)", () => {
    const result = interpretMidiJson(
      '[{"pitch":60,"start":0,"duration":4,"velocity":100,"velocityDeviation":0,"probability":1}]',
      { timeSigDenominator: 4 },
    );

    expect(result).toStrictEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 4,
        velocity: 100,
        velocity_deviation: 0,
        probability: 1,
      },
    ]);
  });

  it("scales musical beats to Ableton beats in x/8 meter", () => {
    // 6/8: toAbleton = 4/8 = 0.5, so 4 musical beats (eighths) -> 2 Ableton beats
    const [note] = interpretMidiJson(
      '[{"pitch":60,"start":2,"duration":4,"velocity":100}]',
      { timeSigDenominator: 8 },
    );

    expect(note?.start_time).toBe(1);
    expect(note?.duration).toBe(2);
  });

  it("applies defaults for missing duration and velocity", () => {
    const [note] = interpretMidiJson('[{"pitch":60,"start":0}]', {
      timeSigDenominator: 4,
    });

    expect(note?.duration).toBe(1);
    expect(note?.velocity).toBe(100);
  });

  it("returns [] for empty or whitespace input", () => {
    expect(interpretMidiJson("")).toStrictEqual([]);
    expect(interpretMidiJson("   ")).toStrictEqual([]);
  });

  it("drops malformed notes (missing pitch/start) but keeps valid ones", () => {
    const result = interpretMidiJson(
      '[{"pitch":60,"start":0},{"start":1},{"pitch":62}]',
      { timeSigDenominator: 4 },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.pitch).toBe(60);
  });

  it("throws on invalid JSON", () => {
    expect(() => interpretMidiJson("not json")).toThrow(/Invalid MIDI JSON/);
  });

  it("throws when the JSON is not an array", () => {
    expect(() => interpretMidiJson('{"pitch":60}')).toThrow(
      /Invalid MIDI JSON/,
    );
  });
});

describe("formatMidiJson", () => {
  it("serializes note events to a JSON array of CodeNotes (4/4)", () => {
    const notes: NoteEvent[] = [
      {
        pitch: 60,
        start_time: 0,
        duration: 4,
        velocity: 100,
        velocity_deviation: 0,
        probability: 1,
      },
    ];

    expect(
      JSON.parse(formatMidiJson(notes, { timeSigDenominator: 4 })),
    ).toStrictEqual([
      {
        pitch: 60,
        start: 0,
        duration: 4,
        velocity: 100,
        velocityDeviation: 0,
        probability: 1,
      },
    ]);
  });

  it("returns '' for no notes", () => {
    expect(formatMidiJson([])).toBe("");
  });
});

describe("round-trip", () => {
  it("interpret -> format preserves note data in a non-4/4 meter", () => {
    const json =
      '[{"pitch":67,"start":3,"duration":2,"velocity":90,"velocityDeviation":5,"probability":0.8}]';
    const events = interpretMidiJson(json, { timeSigDenominator: 8 });
    const roundTripped = formatMidiJson(events, { timeSigDenominator: 8 });

    expect(JSON.parse(roundTripped)).toStrictEqual(JSON.parse(json));
  });
});
