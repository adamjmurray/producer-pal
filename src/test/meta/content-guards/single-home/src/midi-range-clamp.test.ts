// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Stark, the chord speller, MIDI JSON and the transform writer each spelled out
// the 0-127 clamp. They call clampMidi now. A clamp with other bounds (velocity
// 1-127, a deviation, a probability) is a different rule and stays where it is.
const MIDI_CLAMP = /Math\.max\(\s*0,\s*Math\.min\(\s*127,/;

const HOME = "src/shared/pitch.ts";

describe("the MIDI range clamp has one home", () => {
  it("clamps to 0-127 in pitch.ts only", () => {
    // The generated parsers keep the grammars' own copy: Peggy can't import a
    // module, so a grammar action has to spell the clamp out.
    const copies = filesContaining("src", MIDI_CLAMP).filter(
      (file) => !file.includes("generated-"),
    );

    expect(copies, "call clampMidi from pitch.ts").toStrictEqual([HOME]);
  });
});
