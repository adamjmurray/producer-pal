// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  classifyPitchedLine,
  dynamicSuffix,
} from "#src/notation/stark/helpers/stark-note-formatting.ts";
import { noteLabel } from "#src/notation/stark/helpers/stark-interpreter-pitch.ts";

describe("stark note formatting — classifyPitchedLine", () => {
  it("falls back to a melody classification for an empty note list", () => {
    const result = classifyPitchedLine([]);

    // Empty → median pitch defaults to 60 → melody line, C3 register.
    expect(result.lineType).toBe("melody");
    expect(result.registerDefault).toBe(60);
    expect(result.sorted).toStrictEqual([]);
  });
});

describe("stark note formatting — dynamicSuffix", () => {
  it("maps a soft velocity to the ? suffix", () => {
    expect(dynamicSuffix(50)).toBe("?");
  });
});

// Only an absolute-octave token can land out of MIDI range, so that is the
// spelling the warning prints in practice — but the marks and the missing
// octave both have to come out right whichever token reaches it.
describe("stark note formatting — noteLabel", () => {
  it("re-spells an absolute token with its accidental and marks", () => {
    expect(
      noteLabel({ letter: "E", accidental: "b", octave: 3, octaveShift: -2 }),
    ).toBe("Eb3,,");
  });

  it("leaves the octave out of a relative token", () => {
    expect(
      noteLabel({
        letter: "C",
        accidental: null,
        octave: null,
        octaveShift: 2,
      }),
    ).toBe("C''");
  });
});
