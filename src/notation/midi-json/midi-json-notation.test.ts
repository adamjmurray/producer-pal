// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { formatMidiJson, interpretMidiJson } from "./midi-json-notation.ts";

describe("interpretMidiJson", () => {
  it("parses a compact JS-literal array into note events (4/4: musical beats == Ableton beats)", () => {
    const result = interpretMidiJson("[{p:60,t:0,d:4,v:100,vd:0,c:1}]", {
      timeSigDenominator: 4,
    });

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
    const [note] = interpretMidiJson("[{p:60,t:2,d:4,v:100}]", {
      timeSigDenominator: 8,
    });

    expect(note?.start_time).toBe(1);
    expect(note?.duration).toBe(2);
  });

  it("applies defaults for missing duration and velocity", () => {
    const [note] = interpretMidiJson("[{p:60,t:0}]", {
      timeSigDenominator: 4,
    });

    expect(note?.duration).toBe(1);
    expect(note?.velocity).toBe(100);
  });

  it("accepts leading-dot decimals like t:.5 (LLM drops the leading zero)", () => {
    // Regression: the Number rule required a leading digit, so `.5`/`.25` threw
    // a parse error that aborted the ENTIRE clip op instead of parsing as 0.5.
    const [note] = interpretMidiJson("[{p:60,t:.5,d:.25,v:100}]", {
      timeSigDenominator: 4,
    });

    expect(note?.start_time).toBe(0.5);
    expect(note?.duration).toBe(0.25);
  });

  it("accepts long keys (pitch/start/...) and quoted JSON keys", () => {
    const result = interpretMidiJson(
      '[{"pitch":60,"start":0,"duration":4,"velocity":100}]',
    );

    expect(result[0]?.pitch).toBe(60);
    expect(result[0]?.duration).toBe(4);
  });

  it("accepts the long `deviation` key as an alias for vd", () => {
    const [note] = interpretMidiJson("[{p:60,t:0,d:1,v:90,deviation:5}]");

    expect(note?.velocity_deviation).toBe(5);
  });

  it("returns [] for empty or whitespace input", () => {
    expect(interpretMidiJson("")).toStrictEqual([]);
    expect(interpretMidiJson("   ")).toStrictEqual([]);
  });

  it("drops malformed notes (missing pitch/start) but keeps valid ones", () => {
    const result = interpretMidiJson("[{p:60,t:0},{t:1},{p:62}]", {
      timeSigDenominator: 4,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.pitch).toBe(60);
  });

  it("throws on unparseable input", () => {
    expect(() => interpretMidiJson("not json")).toThrow(/Invalid MIDI JSON/);
  });

  it("throws when the input is not an array", () => {
    expect(() => interpretMidiJson("{p:60}")).toThrow(/Invalid MIDI JSON/);
  });
});

describe("formatMidiJson", () => {
  it("serializes note events to a compact JS-literal array with short keys (4/4)", () => {
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

    // vd (0) and c (1) are omitted at their defaults.
    expect(formatMidiJson(notes, { timeSigDenominator: 4 })).toBe(
      "[{p:60,t:0,d:4,v:100}]",
    );
  });

  it("includes vd and c only when they differ from their defaults", () => {
    const notes: NoteEvent[] = [
      {
        pitch: 62,
        start_time: 1,
        duration: 1,
        velocity: 90,
        velocity_deviation: 10,
        probability: 0.75,
      },
    ];

    expect(formatMidiJson(notes, { timeSigDenominator: 4 })).toBe(
      "[{p:62,t:1,d:1,v:90,vd:10,c:0.75}]",
    );
  });

  it("trims floats to at most 4 decimals with no trailing zeros", () => {
    const notes: NoteEvent[] = [
      {
        pitch: 60,
        start_time: 1 / 3,
        duration: 0.1,
        velocity: 100,
        velocity_deviation: 0,
        probability: 1,
      },
    ];

    expect(formatMidiJson(notes)).toBe("[{p:60,t:0.3333,d:0.1,v:100}]");
  });

  it("returns '' for no notes", () => {
    expect(formatMidiJson([])).toBe("");
  });
});

describe("round-trip", () => {
  it("interpret -> format preserves note data in a non-4/4 meter", () => {
    const source = "[{p:67,t:3,d:2,v:90,vd:5,c:0.8}]";
    const events = interpretMidiJson(source, { timeSigDenominator: 8 });
    const roundTripped = formatMidiJson(events, { timeSigDenominator: 8 });

    expect(roundTripped).toBe(source);
  });

  it("format -> interpret preserves note events", () => {
    const notes: NoteEvent[] = [
      {
        pitch: 60,
        start_time: 0,
        duration: 4,
        velocity: 100,
        velocity_deviation: 0,
        probability: 1,
      },
      {
        pitch: 62,
        start_time: 1.5,
        duration: 0.5,
        velocity: 80,
        velocity_deviation: 20,
        probability: 0.5,
      },
    ];

    const roundTripped = interpretMidiJson(formatMidiJson(notes));

    expect(roundTripped).toStrictEqual(notes);
  });
});
