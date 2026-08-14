// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { formatMidiJson, interpretMidiJson } from "./midi-json-notation.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
}));

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

describe("v:0 deletes", () => {
  it("deletes an earlier note at the same pitch+start (last wins)", () => {
    const result = interpretMidiJson(
      "[{p:60,t:0,d:1,v:100},{p:62,t:0,d:1,v:100},{p:60,t:0,d:1,v:0}]",
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.pitch).toBe(62);
  });

  it("keeps a note restated after the marker", () => {
    const result = interpretMidiJson(
      "[{p:60,t:0,d:1,v:100},{p:60,t:0,d:1,v:0},{p:60,t:0,d:4,v:80}]",
    );

    expect(result).toStrictEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 4,
        velocity: 80,
        velocity_deviation: 0,
        probability: 1,
      },
    ]);
  });

  it("is per-note, not sticky: the next note keeps its own velocity", () => {
    const result = interpretMidiJson(
      "[{p:60,t:0,d:1,v:0},{p:62,t:1,d:1,v:100}]",
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.velocity).toBe(100);
  });

  it("leaves notes at a different pitch or start alone", () => {
    const result = interpretMidiJson(
      "[{p:60,t:0,d:1,v:100},{p:60,t:1,d:1,v:100},{p:62,t:0,d:1,v:0},{p:60,t:2,d:1,v:0}]",
    );

    expect(result).toHaveLength(2);
  });

  it("never lets a velocity-0 note through (Live rejects it)", () => {
    // The clamp used to turn v:0 into a velocity-1 note — a silent footgun.
    expect(interpretMidiJson("[{p:60,t:0,d:1,v:0}]")).toStrictEqual([]);
  });

  it("treats a negative velocity as a delete marker too", () => {
    // Matches the transform rule that velocity <= 0 deletes.
    expect(
      interpretMidiJson("[{p:60,t:0,d:1,v:100},{p:60,t:0,d:1,v:-5}]"),
    ).toStrictEqual([]);
  });

  it("still clamps a positive velocity into 1-127", () => {
    const [low, high] = interpretMidiJson(
      "[{p:60,t:0,d:1,v:0.6},{p:62,t:0,d:1,v:200}]",
    );

    expect(low?.velocity).toBe(1);
    expect(high?.velocity).toBe(127);
  });

  it("keeps a quiet fractional velocity a note, not a marker", () => {
    // The marker test runs on the raw velocity: rounding v:0.4 (or a v:1/3
    // ratio) down to 0 would turn a model's 0-1 velocity scale into deletions.
    const result = interpretMidiJson(
      "[{p:60,t:0,d:1,v:100},{p:60,t:0,d:1,v:0.4}]",
    );

    // The v:100 note survives (a marker would have deleted it); the quiet one
    // clamps up to velocity 1.
    expect(result.map((note) => note.velocity)).toStrictEqual([100, 1]);
    expect(interpretMidiJson("[{p:60,t:0,d:1,v:1/3}]")[0]?.velocity).toBe(1);
  });

  it("warns and ignores a marker whose pitch is outside 0-127", () => {
    // Clamping the marker into range would delete a note at 127 (or 0) that the
    // caller never named.
    const result = interpretMidiJson(
      "[{p:127,t:0,d:1,v:100},{p:130,t:0,d:1,v:0}]",
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.pitch).toBe(127);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("pitch 130 is outside 0-127"),
    );
  });

  it("rounds a marker's pitch before the range check (p:127.4 deletes 127)", () => {
    expect(
      interpretMidiJson("[{p:127,t:0,d:1,v:100},{p:127.4,t:0,d:1,v:0}]"),
    ).toStrictEqual([]);
  });

  it("deletes with an explicit d:0 marker (duration is meaningless on a marker)", () => {
    // d:0 used to be dropped by the zero-duration check before the marker logic
    // ran, so the delete silently did nothing.
    expect(
      interpretMidiJson("[{p:60,t:0,d:1,v:100},{p:60,t:0,d:0,v:0}]"),
    ).toStrictEqual([]);
    expect(
      interpretMidiJson("[{p:60,t:0,d:1,v:100},{p:60,t:0,d:-1,v:0}]"),
    ).toStrictEqual([]);
  });

  it("still drops a zero-duration NOTE", () => {
    expect(interpretMidiJson("[{p:60,t:0,d:0,v:100}]")).toStrictEqual([]);
  });

  it("keeps the markers when keepV0Deletes is set (update-clip's merge)", () => {
    const result = interpretMidiJson(
      "[{p:60,t:0,d:1,v:100},{p:60,t:0,d:1,v:0}]",
      { keepV0Deletes: true },
    );

    expect(result).toHaveLength(2);
    expect(result[1]?.velocity).toBe(0);
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

  it("trims non-fraction floats to at most 4 decimals with no trailing zeros", () => {
    // 1.23456 is a lossy decimal with no small-denominator ratio, so it stays
    // decimal (trimmed) — the ratio path only kicks in for true tuplets.
    const notes: NoteEvent[] = [
      {
        pitch: 60,
        start_time: 1.23456,
        duration: 0.1,
        velocity: 100,
        velocity_deviation: 0,
        probability: 1,
      },
    ];

    expect(formatMidiJson(notes)).toBe("[{p:60,t:1.2346,d:0.1,v:100}]");
  });

  it("returns '' for no notes", () => {
    expect(formatMidiJson([])).toBe("");
  });
});

describe("ratio durations (tuplets)", () => {
  it("interprets a ratio duration/start as its exact divided value", () => {
    // d:2/3 = a quarter-note triplet; t:1/3 = an eighth-triplet onset.
    const [note] = interpretMidiJson("[{p:60,t:1/3,d:2/3,v:100}]");

    expect(note?.start_time).toBe(1 / 3);
    expect(note?.duration).toBe(2 / 3);
  });

  it("interprets a negative ratio start (note before clip start)", () => {
    const [note] = interpretMidiJson("[{p:60,t:-2/3,d:1/3,v:100}]");

    expect(note?.start_time).toBe(-2 / 3);
    expect(note?.duration).toBe(1 / 3);
  });

  it("interprets a ratio > 1 (t:4/3, d:4/3)", () => {
    const [note] = interpretMidiJson("[{p:60,t:4/3,d:4/3,v:100}]");

    expect(note?.start_time).toBe(4 / 3);
    expect(note?.duration).toBe(4 / 3);
  });

  it("filters out a note whose ratio divides by zero (Infinity / NaN)", () => {
    // A div-by-zero ratio (5/0 → Infinity, 0/0 → NaN) is typeof "number" in
    // every num/den field but slips past the range checks (`duration <= 0`
    // misses Infinity/NaN; Math.max/min pass NaN through), so all must be
    // dropped before reaching add_new_notes rather than corrupting the clip.
    expect(interpretMidiJson("[{p:60,t:0,d:5/0,v:100}]")).toStrictEqual([]);
    expect(interpretMidiJson("[{p:60,t:0,d:0/0,v:100}]")).toStrictEqual([]);
    expect(interpretMidiJson("[{p:60,t:5/0,d:1,v:100}]")).toStrictEqual([]);
    expect(interpretMidiJson("[{p:5/0,t:0,d:1,v:100}]")).toStrictEqual([]);
    // velocity (v) and probability (c) are also num/den fields.
    expect(interpretMidiJson("[{p:60,t:0,d:1,v:5/0}]")).toStrictEqual([]);
    expect(interpretMidiJson("[{p:60,t:0,d:1,v:0/0}]")).toStrictEqual([]);
    expect(interpretMidiJson("[{p:60,t:0,d:1,v:100,c:5/0}]")).toStrictEqual([]);
    expect(interpretMidiJson("[{p:60,t:0,d:1,v:100,c:0/0}]")).toStrictEqual([]);
  });

  it("keeps valid notes alongside a filtered div-by-zero note", () => {
    const events = interpretMidiJson(
      "[{p:60,t:0,d:5/0,v:100},{p:62,t:1,d:1,v:90}]",
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.pitch).toBe(62);
  });
});

describe("dropped-note warnings", () => {
  beforeEach(() => {
    vi.mocked(console.warn).mockClear();
  });

  it("warns instead of dropping a malformed note in silence", () => {
    // The whole point: a caller that wrote 2 notes and got 1 back used to have
    // nothing to notice, since the tool still reported success.
    interpretMidiJson("[{t:0,d:1,v:100},{p:62,t:1,d:1,v:90}]");

    expect(console.warn).toHaveBeenCalledWith(
      "ignoring 1 invalid MIDI JSON note: missing or non-numeric p/t",
    );
  });

  it("says nothing when every note is valid", () => {
    interpretMidiJson("[{p:60,t:0,d:1,v:100}]");

    expect(console.warn).not.toHaveBeenCalled();
  });

  it("counts repeats of the same reason instead of repeating it", () => {
    interpretMidiJson("[{t:0,d:1,v:100},{t:1,d:1,v:90},{p:64,t:2,d:0,v:90}]");

    expect(console.warn).toHaveBeenCalledWith(
      "ignoring 3 invalid MIDI JSON notes: missing or non-numeric p/t (2), d must be greater than 0",
    );
  });

  it("names the offending pitch on an out-of-range delete marker", () => {
    interpretMidiJson("[{p:127,t:0,d:1,v:100},{p:130,t:0,d:1,v:0}]");

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("delete marker pitch 130 is outside 0-127"),
    );
  });

  it("reports a non-finite field rather than dropping it in silence", () => {
    interpretMidiJson("[{p:60,t:0,d:5/0,v:100}]");

    expect(console.warn).toHaveBeenCalledWith(
      "ignoring 1 invalid MIDI JSON note: non-finite d, v, or c",
    );
  });

  it("caps the distinct reasons it lists and counts the rest", () => {
    // Four distinct reasons; only three are named so a pile of bad input can't
    // flood the model's context.
    interpretMidiJson(
      "[{t:0,d:1,v:100},{p:60,t:0,d:0,v:100},{p:60,t:0,d:0/0,v:100},{p:130,t:0,d:1,v:0}]",
    );

    expect(console.warn).toHaveBeenCalledWith(
      "ignoring 4 invalid MIDI JSON notes: missing or non-numeric p/t, " +
        "d must be greater than 0, non-finite d, v, or c, and 1 more",
    );
  });

  it("serializes a repeating-decimal tuplet as an exact ratio", () => {
    const notes: NoteEvent[] = [
      { pitch: 60, start_time: 1 / 3, duration: 2 / 3, velocity: 100 },
    ];

    expect(formatMidiJson(notes)).toBe("[{p:60,t:1/3,d:2/3,v:100}]");
  });

  it("serializes higher tuplets (sixths, twelfths) as reduced ratios", () => {
    const notes: NoteEvent[] = [
      { pitch: 60, start_time: 1 / 6, duration: 1 / 12, velocity: 100 },
    ];

    expect(formatMidiJson(notes)).toBe("[{p:60,t:1/6,d:1/12,v:100}]");
  });

  it("serializes a fine tuplet whose denominator exceeds 16 (d:1/24)", () => {
    // A 32nd-note triplet (denominator 24) was beyond the old cap of 16, so it
    // used to drift back through a lossy decimal. Now it round-trips exactly.
    const notes: NoteEvent[] = [
      { pitch: 60, start_time: 1 / 24, duration: 1 / 24, velocity: 100 },
    ];

    expect(formatMidiJson(notes)).toBe("[{p:60,t:1/24,d:1/24,v:100}]");
    expect(
      formatMidiJson(interpretMidiJson("[{p:60,t:1/24,d:1/24,v:100}]")),
    ).toBe("[{p:60,t:1/24,d:1/24,v:100}]");
  });

  it("serializes odd small tuplets (/9 /11 /13 /15) as exact ratios", () => {
    // Regression: narrowing the candidate set to barbeat's canonical
    // denominators dropped 9/11/13/15 (which the original dense 2..16 sweep
    // covered), so these odd tuplets fell back to a lossy decimal and drifted
    // ~1e-5 on round-trip. Every denominator 2..16 must spell exactly again.
    for (const den of [9, 11, 13, 15]) {
      const notes: NoteEvent[] = [
        { pitch: 60, start_time: 1 / den, duration: 1 / den, velocity: 100 },
      ];
      const source = `[{p:60,t:1/${den},d:1/${den},v:100}]`;

      expect(formatMidiJson(notes)).toBe(source);
      expect(formatMidiJson(interpretMidiJson(source))).toBe(source);
    }
  });

  it("keeps exact decimals decimal (integers, halves, 0.1 never become ratios)", () => {
    const notes: NoteEvent[] = [
      { pitch: 60, start_time: 0.5, duration: 0.1, velocity: 100 },
    ];

    expect(formatMidiJson(notes)).toBe("[{p:60,t:0.5,d:0.1,v:100}]");
  });

  it("round-trips a ratio tuplet exactly (d:1/3 in and out)", () => {
    const source =
      "[{p:60,t:0,d:1/3,v:100},{p:64,t:1/3,d:1/3,v:100},{p:67,t:2/3,d:1/3,v:100}]";

    expect(formatMidiJson(interpretMidiJson(source))).toBe(source);
  });

  it("round-trips a ratio tuplet exactly in a non-4/4 meter", () => {
    const source = "[{p:60,t:1/3,d:1/3,v:100}]";
    const events = interpretMidiJson(source, { timeSigDenominator: 8 });

    expect(formatMidiJson(events, { timeSigDenominator: 8 })).toBe(source);
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
