// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Parity between the Stark grammar's drum-header pitch name and the regex that
// takes it apart. The same shape is spelled twice, in two languages:
//
//   stark-grammar.peggy   DrumPitchName = $([A-Ga-g] [#b]? "-"? [0-9]+)
//   stark-interpreter.ts  /^([A-Ga-g])([#b]?)(-?\d+)$/
//
// drumHeaderPitch() resolves the header arithmetically rather than through
// pitch.ts's exact table, so enharmonic spellings (Cb/E#/Fb/B#) work — and it
// asserts the match instead of null-checking it, because the grammar is what
// guarantees the shape. Nothing mechanical ties the two patterns together, so
// widening one alone (a double accidental, a Unicode ♯) turns a header the
// grammar now accepts into a thrown `Bug:` at interpret time. This test is the
// tie: every header below must be rejected by the grammar or accepted by BOTH.
//
// It also pins the split between the two failure modes, which are NOT the same:
// a header the user can actually mistype resolves out of MIDI range and gets
// warn-and-skip (one drum line dropped, rest of the clip intact), while a shape
// mismatch can only mean the two patterns drifted and should fail loudly.

import { describe, expect, it, vi } from "vitest";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";

/**
 * Run one drum header through the real interpreter.
 * @param header - Drum header text, e.g. "C#-1"
 * @returns Resolved pitches, or null when the grammar rejected the header
 */
function resolveHeader(header: string): number[] | null {
  try {
    return interpretNotation(`${header}: X`).map((note) => note.pitch);
  } catch (error) {
    const message = errorMessage(error);

    if (message.startsWith("Stark notation parse error:")) return null;

    throw new Error(
      `The grammar accepted drum header "${header}" but drumHeaderPitch's regex did not (${message}). ` +
        "DrumPitchName in stark-grammar.peggy and the regex in stark-interpreter.ts have diverged — update both.",
      { cause: error },
    );
  }
}

describe("drum-header pitch-name parity (Stark grammar ↔ interpreter regex)", () => {
  describe("both sides accept, and the shared arithmetic resolves the pitch", () => {
    // [header, MIDI]. midi = (octave + 2) * 12 + naturalPitchClass ± accidental.
    // Spans every axis the two patterns describe: letter case, the three
    // accidental states, negative octaves, and the enharmonics that motivated
    // the arithmetic path in the first place.
    const HEADERS: ReadonlyArray<readonly [string, number]> = [
      ["C1", 36],
      ["G3", 67],
      ["c1", 36], // lowercase letter
      ["C#1", 37],
      ["Cb2", 47],
      ["b1", 47], // lowercase b is the LETTER here, not a flat
      ["bb1", 46], // ...and here it is both: B flat
      ["C-1", 12], // negative octave
      ["C#-1", 13], // accidental plus negative octave
      ["E#3", 65], // enharmonic, same octave
      ["Fb2", 52],
      ["B#3", 72], // enharmonic, wraps up an octave
    ];

    for (const [header, midi] of HEADERS) {
      it(`"${header}" resolves to MIDI ${midi}`, () => {
        expect(resolveHeader(header)).toStrictEqual([midi]);
      });
    }
  });

  describe("a well-shaped header that lands outside MIDI range warns and skips", () => {
    // The user-reachable failure. It must stay warn-and-skip so the rest of the
    // clip survives — never a throw. Multi-digit octaves also exercise `[0-9]+`
    // against the regex's `\d+`.
    for (const header of ["C9", "C10", "C-10"]) {
      it(`"${header}" drops its line and warns`, () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        expect(resolveHeader(header)).toStrictEqual([]);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("no resolvable pitch"),
        );

        warn.mockRestore();
      });
    }
  });

  describe("both sides reject, so the regex never sees these", () => {
    // Each is a plausible widening of DrumPitchName. If one starts parsing
    // without the regex learning it too, resolveHeader throws instead of
    // returning null and names the file to fix.
    for (const header of [
      "H1", // not a note letter
      "C##1", // double sharp
      "Cbb1", // double flat
      "C♯1", // Unicode sharp
      "D♭1", // Unicode flat
      "Cx1", // bogus accidental
      "C", // no octave
      "C#", // accidental, no octave
    ]) {
      it(`"${header}" is rejected by the grammar`, () => {
        expect(resolveHeader(header)).toBeNull();
      });
    }
  });
});
