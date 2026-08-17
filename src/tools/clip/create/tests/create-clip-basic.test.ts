// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type MidiNote } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { type SlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { createClip } from "../create-clip.ts";
import { convertTimingParameters } from "../helpers/create-clip-helpers.ts";
import {
  calculateClipLength,
  handleAutoPlayback,
} from "../helpers/create-clip-validation-helpers.ts";
import {
  expectClipCreated,
  expectNotesAdded,
  note,
  setupSessionMocks,
} from "./create-clip-test-helpers.ts";

describe("createClip - basic validation and time signatures", () => {
  it("should throw error when nothing names a destination", async () => {
    await expect(createClip({})).rejects.toThrow(
      "createClip failed: path is required",
    );
  });

  // A bare track is half a destination either way — it needs a scene or an
  // arrangementStart — so the error names both fixes rather than the missing param.
  it("should throw error when a track is named without a spot on it", async () => {
    await expect(createClip({ path: "t0" })).rejects.toThrow(
      'createClip failed: path "t0" names no position',
    );
  });

  it("should throw error for invalid slot format", async () => {
    await expect(
      createClip({
        slot: "invalid",
      }),
    ).rejects.toThrow("invalid toSlot");
  });

  it("should validate time signature early when provided", async () => {
    await expect(
      createClip({
        slot: "0/0",
        timeSignature: "invalid",
      }),
    ).rejects.toThrow("Time signature must be in format");
  });

  it("should read time signature from song when not provided", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 3, signature_denominator: 4 },
      clip: { length: 6 }, // 2 bars in 3/4 time = 6 beats
    });

    const result = await createClip({
      slot: "0/0",
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar from song
    });

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      path: "t0/s0",
      noteCount: 2,
      length: "2bar",
    });

    // Verify the parsed notes were correctly added to the clip
    expectNotesAdded(clip, [
      note(60, 0, 1), // C3
      note(62, 3, 1), // D3 at 3 beats per bar in 3/4
    ]);
  });

  it("should parse notes using provided time signature", async () => {
    const { clip } = setupSessionMocks();

    await createClip({
      slot: "0/0",
      timeSignature: "3/4",
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar
    });

    expectNotesAdded(clip, [note(60, 0, 1), note(62, 3, 1)]);
  });

  it("should correctly handle 6/8 time signature with Ableton's quarter-note beats", async () => {
    const { clip } = setupSessionMocks();

    await createClip({
      slot: "0/0",
      timeSignature: "6/8",
      notes: "C3 1|1 D3 2|1",
    });

    // In 6/8, beat 2|1 = 3 Ableton beats (6 musical beats * 4/8). Default duration
    // is a quarter note (meter-independent), so 1 Ableton beat.
    expectNotesAdded(clip, [note(60, 0, 1), note(62, 3, 1)]);
  });

  it("should create clip with specified length", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4 },
    });

    await createClip({
      slot: "0/0",
      length: "1bar+n3/4",
      looping: false,
    });

    expectClipCreated(clipSlot, 7);
  });

  it("should create clip with specified length for looping clips", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4 },
    });

    await createClip({
      slot: "0/0",
      length: "2bar",
      looping: true,
    });

    expectClipCreated(clipSlot, 8);
  });

  it("should calculate clip length from notes when markers not provided", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
      notes: "n/2 C3 1|1 n3/8 D3 1|4", // Last note starts at beat 3 (0-based), rounds up to 1 bar = 4 beats
    });

    expectClipCreated(clipSlot, 4);
  });

  it("should handle time signatures with denominators other than 4", async () => {
    const { clipSlot, clip } = setupSessionMocks({
      liveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    // n/2 = half note = 2 quarters; n3/8 = dotted quarter = 1.5 quarters.
    // Durations are absolute (meter-independent) under new semantics.
    await createClip({
      slot: "0/0",
      notes: "n/2 C3 1|1 n3/8 D3 1|2", // Last note starts at beat 1 (0.5 Ableton beats), rounds up to 1 bar
    });

    expectClipCreated(clipSlot, 3); // 1 bar in 6/8 = 3 Ableton beats
    // Live durations are in quarter notes; absolute durations don't change with meter
    expectNotesAdded(clip, [note(60, 0, 2), note(62, 0.5, 1.5)]);
  });

  it("should create 1-bar clip when empty in 4/4 time", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
    });

    expectClipCreated(clipSlot, 4); // 1 bar in 4/4 = 4 Ableton beats
  });

  it("should create 1-bar clip when empty in 6/8 time", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    await createClip({
      slot: "0/0",
    });

    expectClipCreated(clipSlot, 3); // 1 bar in 6/8 = 3 Ableton beats
  });

  it("should use 1-bar clip length when notes are empty in 4/4", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
      notes: "",
    });

    expectClipCreated(clipSlot, 4); // 1 bar in 4/4 = 4 Ableton beats
  });

  it("should set loop_end to clip length for empty clips (not 0)", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
    });

    // loop_end must be > loop_start (Live API constraint)
    // For empty clips, loop_end should be set to clipLength (1 bar = 4 beats)
    expect(clip.set).toHaveBeenCalledWith("loop_end", 4);
    expect(clip.set).toHaveBeenCalledWith("end_marker", 4);
  });

  it("should round up to next bar based on latest note start in 4/4", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
      notes: "C4 1|4.5", // Note starts at beat 3.5 (0-based), which is in bar 1, rounds up to 1 bar
    });

    expectClipCreated(clipSlot, 4); // Rounds up to 1 bar = 4 Ableton beats
  });

  it("should round up to next bar based on latest note start in 6/8", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    await createClip({
      slot: "0/0",
      notes: "C4 1|5.5", // Note starts at beat 4.5 in musical beats (2.25 Ableton beats), rounds up to 1 bar
    });

    expectClipCreated(clipSlot, 3); // Rounds up to 1 bar in 6/8 = 3 Ableton beats
  });

  it("should round up to next bar when note start is in next bar", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
      notes: "C4 2|1", // Note starts at bar 2, beat 1 (beat 4 in 0-based), rounds up to 2 bars
    });

    expectClipCreated(clipSlot, 8); // Rounds up to 2 bars = 8 Ableton beats
  });

  it("warns when firstStart is used with non-looping clips", async () => {
    setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
      notes: "C4 1|1",
      firstStart: "1|2",
      looping: false,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        "firstStart parameter ignored for non-looping clips",
      ),
    );
  });

  it("sets playing_position when firstStart is used with looping clips", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
      notes: "C4 1|1",
      firstStart: "1|2",
      looping: true,
    });

    // 1|2 = 1 beat in 4/4 time
    expect(clip.set).toHaveBeenCalledWith("playing_position", 1);
  });
});

describe("convertTimingParameters (unit)", () => {
  it("warns when firstStart is used with a non-looping clip", () => {
    convertTimingParameters(null, null, "1|2", null, false, 4, 4, 4, 4);

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("firstStart parameter ignored"),
    );
  });

  it("does NOT warn when firstStart is used with a looping clip", () => {
    // looping === true: the firstStart-ignored warning must not fire. Kills the
    // `looping === false` → true and whole-condition → true / && → || mutants.
    convertTimingParameters(null, null, "1|2", null, true, 4, 4, 4, 4);

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("firstStart parameter ignored"),
    );
  });

  it("does NOT warn when firstStart is set but looping is unset (null)", () => {
    // looping is null (not false), so `firstStart != null && looping === false`
    // is false; the && → || mutant would make it warn.
    convertTimingParameters(null, null, "1|2", null, null, 4, 4, 4, 4);

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("firstStart parameter ignored"),
    );
  });

  it("adds startBeats to the length when computing endBeats (?? 0 fallback)", () => {
    // start "2|1" = 4 beats, length "1bar" = 4 beats → endBeats = 4 + 4 = 8.
    // The `startBeats ?? 0` → `startBeats && 0` mutant would zero the offset (→ 4).
    const result = convertTimingParameters(
      null,
      "2|1",
      null,
      "1bar",
      null,
      4,
      4,
      4,
      4,
    );

    expect(result.startBeats).toBe(4);
    expect(result.endBeats).toBe(8);
  });

  it("falls back to 0 for the start offset when start is not provided", () => {
    const result = convertTimingParameters(
      null,
      null,
      null,
      "1bar",
      null,
      4,
      4,
      4,
      4,
    );

    expect(result.startBeats).toBeNull();
    expect(result.endBeats).toBe(4);
  });
});

describe("calculateClipLength (unit)", () => {
  it("sizes an empty-marker clip from the LATEST (max) note start, not the earliest", () => {
    // Notes at beats 0 and 5 in 4/4 (4 Ableton beats/bar). Max start 5 rounds up
    // to 2 bars = 8 beats; the Math.max → Math.min mutant would use start 0 → 4.
    const notes = [{ start_time: 0 }, { start_time: 5 }] as MidiNote[];

    expect(calculateClipLength(null, notes, 4, 4)).toBe(8);
  });

  it("uses the explicit endBeats when provided", () => {
    expect(calculateClipLength(10, [], 4, 4)).toBe(10);
  });
});

describe("handleAutoPlayback (unit)", () => {
  const slot = (): SlotPosition => ({ trackIndex: 0, sceneIndex: 0 });

  it("no-ops (does not reach the switch) when view is not session", () => {
    // auto is truthy + view arrangement → the guard returns early. The
    // `view !== "session"` → false mutant would fall through to the switch and
    // throw on the unknown auto value.
    expect(() =>
      handleAutoPlayback("unknown-mode", "arrangement", [slot()]),
    ).not.toThrow();
  });

  it("no-ops (does not reach the switch) when there are no session slots", () => {
    // Empty slots → guard returns early. The `sessionSlots.length === 0` → false
    // mutant would fall through to the switch and throw on the unknown auto value.
    expect(() =>
      handleAutoPlayback("unknown-mode", "session", []),
    ).not.toThrow();
  });
});
