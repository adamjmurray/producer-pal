// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";

// Resolve a ±n offset beat the way the grammar does: base + (num/den)*denom.
// Mirrors the float arithmetic so toStrictEqual matches bit-for-bit.
const obeat = (base: number, num: number, den: number, denom = 4): number =>
  base + (num / den) * denom;

describe("BarBeatScript Parser - time declarations", () => {
  it("parses integer and floating point beats", () => {
    expect(parser.parse("1|1 C3 1|1.5 D3 1|2.25 E3")).toStrictEqual([
      { bar: 1, beat: 1 },
      { pitch: 60 },
      { bar: 1, beat: 1.5 },
      { pitch: 62 },
      { bar: 1, beat: 2.25 },
      { pitch: 64 },
    ]);
  });

  it("parses note-value offset beats (eighth triplets)", () => {
    // +n/12 = +1/3 beat at the default 4/4; +n/6 = +2/3 beat
    expect(parser.parse("1|1+n/12 C3 1|1+n/6 D3 1|2+n/12 E3")).toStrictEqual([
      { bar: 1, beat: obeat(1, 1, 12) },
      { pitch: 60 },
      { bar: 1, beat: obeat(1, 1, 6) },
      { pitch: 62 },
      { bar: 1, beat: obeat(2, 1, 12) },
      { pitch: 64 },
    ]);
  });

  it("parses mixed decimal and offset beats", () => {
    expect(
      parser.parse("1|1 C3 1|1+n/12 D3 1|1.5 E3 1|1+n/6 F3"),
    ).toStrictEqual([
      { bar: 1, beat: 1 },
      { pitch: 60 },
      { bar: 1, beat: obeat(1, 1, 12) },
      { pitch: 62 },
      { bar: 1, beat: 1.5 },
      { pitch: 64 },
      { bar: 1, beat: obeat(1, 1, 6) },
      { pitch: 65 },
    ]);
  });

  it("parses + and - note-value offsets", () => {
    // 2+n/12 = beat 2 + 1/3; 2-n3/16 = beat 2 - 3/4
    expect(parser.parse("1|2+n/12 C3 1|2-n3/16 D3")).toStrictEqual([
      { bar: 1, beat: obeat(2, 1, 12) },
      { pitch: 60 },
      { bar: 1, beat: 2 - 3 / 4 },
      { pitch: 62 },
    ]);
  });

  it("parses decimal-base note-value offsets (1|1.5+n/4)", () => {
    // The offset base may be a decimal beat, not just an integer: `1.5+n/4` =
    // beat 1.5 + a quarter note; `2.25-n/24` = beat 2.25 − an eighth triplet.
    expect(
      parser.parse("1|1.5+n/4 C3 1|2.25-n/24 D3 1|1.5+n/8 E3"),
    ).toStrictEqual([
      { bar: 1, beat: obeat(1.5, 1, 4) },
      { pitch: 60 },
      { bar: 1, beat: 2.25 - (1 / 24) * 4 },
      { pitch: 62 },
      { bar: 1, beat: obeat(1.5, 1, 8) },
      { pitch: 64 },
    ]);
  });

  it("parses beat lists with note-value offsets", () => {
    expect(parser.parse("1|1,2+n/16,2+n/8,2+n3/16")).toStrictEqual([
      { bar: 1, beat: 1 },
      { bar: 1, beat: 2 + 1 / 4 },
      { bar: 1, beat: 2 + 1 / 2 },
      { bar: 1, beat: 2 + 3 / 4 },
    ]);
  });

  it("parses repeat pattern with fractional step (numerator + denominator)", () => {
    expect(parser.parse("1|1x3@n1/3")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 3, step: 1 / 3 } },
    ]);
    expect(parser.parse("1|1x4@n3/4")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 4, step: 3 / 4 } },
    ]);
  });

  it("parses repeat pattern with fractional step (optional numerator)", () => {
    expect(parser.parse("1|1x3@n/3")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 3, step: 1 / 3 } },
    ]);
    expect(parser.parse("1|1x4@n/4")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 4, step: 1 / 4 } },
    ]);
  });

  it("parses repeat pattern with note-value offset start (positions still meter-relative)", () => {
    expect(parser.parse("1|2+n/12x3@n1/3")).toStrictEqual([
      { bar: 1, beat: { start: obeat(2, 1, 12), times: 3, step: 1 / 3 } },
    ]);
  });

  it("parses repeat pattern with a decimal-base offset start (1|1.5+n/12x3)", () => {
    expect(parser.parse("1|1.5+n/12x3@n1/3")).toStrictEqual([
      { bar: 1, beat: { start: obeat(1.5, 1, 12), times: 3, step: 1 / 3 } },
    ]);
  });

  it("parses repeat pattern without step (defaults to null)", () => {
    expect(parser.parse("1|1x4")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 4, step: null } },
    ]);
  });

  it("parses repeat pattern mixed with regular beats", () => {
    expect(parser.parse("1|1x4@n1/4,3.5")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 4, step: 1 / 4 } },
      { bar: 1, beat: 3.5 },
    ]);
  });

  it("parses multiple repeat patterns in beat list", () => {
    expect(parser.parse("1|1x2@n1/4,3x2@n/8")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 2, step: 1 / 4 } },
      { bar: 1, beat: { start: 3, times: 2, step: 1 / 8 } },
    ]);
  });

  it("parses bar-based steps (@Nbar, meter-aware)", () => {
    expect(parser.parse("1|1x4@1bar")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 4, step: 0, stepBars: 1 } },
    ]);
    expect(parser.parse("1|1x2@2bar")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 2, step: 0, stepBars: 2 } },
    ]);
  });

  it("parses mixed bar+note-value steps (@Nbar+nA/B)", () => {
    expect(parser.parse("1|1x2@1bar+n/4")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 2, step: 1 / 4, stepBars: 1 } },
    ]);
  });

  it("parses minus-tail bar steps (@Nbar-nA/B)", () => {
    // The tail sign rides the shared duration grammar: `@1bar-n/4` stores a
    // negative note-value fraction; the interpreter resolves it to a near-bar
    // advance (one bar minus a quarter = 3 beats in 4/4).
    expect(parser.parse("1|1x2@1bar-n/4")).toStrictEqual([
      { bar: 1, beat: { start: 1, times: 2, step: -1 / 4, stepBars: 1 } },
    ]);
  });

  it("rejects bare-fraction step intervals (n prefix required)", () => {
    expect(() => parser.parse("1|1x4@/4")).toThrow(
      /step intervals use the note-value form.*Got @\/4/,
    );
    expect(() => parser.parse("1|1x4@3/4")).toThrow(
      /step intervals use the note-value form.*Got @3\/4/,
    );
  });

  it("rejects n-prefixed bar steps with the targeted Nbar error (@n1bar)", () => {
    // Same category error as the duration sites: bars are the bare `Nbar` form,
    // never `n`-prefixed. The step interval is a duration site too (it already
    // honors the plural `@2bars` alias), so it gets the steered error, not the
    // generic "note-value form" one.
    expect(() => parser.parse("1|1x3@n1bar")).toThrow(
      /bar steps don't use the "n" prefix — write @Nbar \(e\.g\. @1bar\)/,
    );
    expect(() => parser.parse("1|1x3@n/1bar")).toThrow(
      /bar steps don't use the "n" prefix — write @Nbar \(e\.g\. @1bar\)/,
    );
    expect(() => parser.parse("1|1x3@n3/4bar")).toThrow(
      /bar steps don't use the "n" prefix — write @Nbar \(e\.g\. @4bar\)/,
    );
  });

  it("rejects bare-integer step intervals (bare beats not allowed)", () => {
    expect(() => parser.parse("1|1x4@1")).toThrow(
      /step intervals use the note-value form.*Got @1/,
    );
    expect(() => parser.parse("1|1x4@0")).toThrow(
      /step intervals use the note-value form.*Got @0/,
    );
  });

  it("rejects decimal step intervals", () => {
    expect(() => parser.parse("1|3x4@0.25")).toThrow(
      /step intervals use the note-value form.*Got @0\.25/,
    );
  });

  it("rejects mixed-number step intervals", () => {
    expect(() => parser.parse("1|1x4@1+1/2")).toThrow(
      /step intervals use the note-value form.*Got @1\+1\/2/,
    );
  });

  it("rejects step size of zero (e.g. @n0/1)", () => {
    expect(() => parser.parse("1|1x4@n0/1")).toThrow(
      "Repeat step size must be greater than 0",
    );
  });

  it("borrows across the bar line for a -n offset before the downbeat", () => {
    // `2|1-n/12` = just before the bar-2 downbeat → bar 1, beat 4⅔ in 4/4.
    expect(parser.parse("2|1-n/12 C3")).toStrictEqual([
      { bar: 1, beat: 1 - (1 / 12) * 4 + 4 },
      { pitch: 60 },
    ]);
    // A larger offset borrows more than a beat: `2|1-n/2` = bar 2 − a half note
    // → bar 1, beat 3.
    expect(parser.parse("2|1-n/2 C3")).toStrictEqual([
      { bar: 1, beat: 3 },
      { pitch: 60 },
    ]);
    // The borrow also applies to a repeat's start position.
    expect(parser.parse("2|1-n/2x2 C3")).toStrictEqual([
      { bar: 1, beat: { start: 3, times: 2, step: null } },
      { pitch: 60 },
    ]);
  });

  it("resolves a -n offset before 1|1 to a pre-clip-start position (no throw)", () => {
    // No earlier bar to borrow from: the bar goes to 0 and the position resolves
    // to negative time when interpreted (a note before the clip start). Allowed,
    // not rejected — Live accepts notes at negative time.
    expect(parser.parse("1|1-n/4 C3")).toStrictEqual([
      { bar: 0, beat: 4 },
      { pitch: 60 },
    ]);
    expect(parser.parse("1|1-n/8 C3")).toStrictEqual([
      { bar: 0, beat: 4.5 },
      { pitch: 60 },
    ]);
    expect(parser.parse("1|1-n/12 C3")).toStrictEqual([
      { bar: 0, beat: 1 - (1 / 12) * 4 + 4 },
      { pitch: 60 },
    ]);
  });

  it("rejects bare-fraction beat positions with a targeted error", () => {
    expect(() => parser.parse("1|1/2 C3")).toThrow(/Got bare fraction 1\/2/);
    expect(() => parser.parse("1|4/3 C3")).toThrow(/Got bare fraction 4\/3/);
  });

  it("rejects bar-relative mixed-number beats (n prefix required)", () => {
    expect(() => parser.parse("1|2+1/3 C3")).toThrow(
      /beat offsets use the note-value form.*Got 2\+1\/3/,
    );
  });
});
