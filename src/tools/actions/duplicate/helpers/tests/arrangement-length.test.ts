// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  copyLengthBeats,
  parseArrangementLength,
} from "../clip/arrangement-length.ts";

describe("parseArrangementLength", () => {
  it("parses <count>bar duration to beats", () => {
    const result = parseArrangementLength("4bar", 4, 4);

    expect(result).toBe(16); // 4 bars in 4/4 = 16 beats
  });

  it("parses <count>bar+n<fraction> durations", () => {
    const result = parseArrangementLength("2bar+n5/8", 4, 4);

    expect(result).toBe(10.5); // 2 bars (8 beats) + n5/8 whole note (2.5 beats)
  });

  it("parses note-value-only durations", () => {
    expect(parseArrangementLength("n1/4", 4, 4)).toBe(1); // quarter note
    expect(parseArrangementLength("n/8", 4, 4)).toBe(0.5); // implicit numerator
  });

  it("rejects bare fractions (n prefix required)", () => {
    expect(() => parseArrangementLength("1/4", 4, 4)).toThrow(
      /Invalid duration format/,
    );
  });

  it("throws error for zero length", () => {
    expect(() => parseArrangementLength("0bar", 4, 4)).toThrow(
      "arrangementLength must be positive",
    );
  });

  it("throws error for invalid format", () => {
    expect(() => parseArrangementLength("abc", 4, 4)).toThrow(
      /Invalid duration format/,
    );
  });

  it("rejects bare numbers; off-grid lengths use the n<beats>/4 escape", () => {
    // A duration is never a bare scalar. Off-grid lengths must use the
    // decimal-numerator escape abletonBeatsToDuration emits (n<beats>/4).
    expect(() => parseArrangementLength("4", 4, 4)).toThrow(
      /Invalid duration format/,
    );
    expect(() => parseArrangementLength("5.9877", 4, 4)).toThrow(
      /Invalid duration format/,
    );
    expect(parseArrangementLength("n5.9877/4", 4, 4)).toBeCloseTo(5.9877, 6);
  });

  it("throws error for retired bar:beat glyph", () => {
    expect(() => parseArrangementLength("1:0", 4, 4)).toThrow(
      /Invalid duration format/,
    );
  });

  it("handles different time signatures", () => {
    const result = parseArrangementLength("2bar", 3, 4);

    expect(result).toBe(6); // 2 bars in 3/4 = 6 beats
  });
});

const CLIP_PATH = livePath.track(0).clipSlot(0).clip();

/**
 * Register a MIDI clip and return a handle on it.
 * @param properties - The clip's properties
 * @returns A LiveAPI handle on the clip
 */
function midiClip(properties: Record<string, number>): LiveAPI {
  registerMockObject("clip", {
    path: CLIP_PATH,
    properties: { is_midi_clip: 1, is_arrangement_clip: 0, ...properties },
  });

  return LiveAPI.from(CLIP_PATH);
}

describe("copyLengthBeats", () => {
  it("adds a looped session clip's pre-roll to its loop length", () => {
    const clip = midiClip({
      looping: 1,
      length: 12,
      loop_start: 4,
      start_marker: 0,
    });

    expect(copyLengthBeats(clip)).toBe(16);
  });

  it("is the loop length when the start marker sits inside the loop", () => {
    const clip = midiClip({
      looping: 1,
      length: 16,
      loop_start: 0,
      start_marker: 8,
    });

    expect(copyLengthBeats(clip)).toBe(16);
  });

  it("is the clip's length for an unlooped session clip", () => {
    const clip = midiClip({
      looping: 0,
      length: 10,
      loop_start: 4,
      start_marker: 0,
    });

    expect(copyLengthBeats(clip)).toBe(10);
  });

  it("is an arrangement clip's whole span, not its loop", () => {
    const clip = midiClip({
      is_arrangement_clip: 1,
      looping: 1,
      length: 4,
      start_time: 8,
      end_time: 40,
    });

    expect(copyLengthBeats(clip)).toBe(32);
  });
});
