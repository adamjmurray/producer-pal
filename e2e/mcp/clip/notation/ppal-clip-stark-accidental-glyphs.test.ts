// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E for Stark's ♯/♭ accidentals: the glyphs must survive the trip from the
 * MCP server into the Max V8 runtime, which unit tests can't cover, and land
 * the same notes as `#`/`b`.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track; slots /0 and /1 are free.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-stark-accidental-glyphs
 */
import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";
import { setupMcpTestContext } from "../../mcp-test-helpers.ts";
import {
  createAndReadback,
  restoreNotationAfterAll,
} from "../helpers/ppal-clip-transforms-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

restoreNotationAfterAll();

/**
 * @param notation - Stark text
 * @returns Pitches in time order
 */
function pitchesOf(notation: string): number[] {
  return interpretNotation(notation)
    .toSorted((a, b) => a.start_time - b.start_time || a.pitch - b.pitch)
    .map((note) => note.pitch);
}

describe("ppal-create-clip Stark ♯/♭ accidentals", () => {
  it.each([
    ["melody", "melody: C♯ E♭ G♯ B♭", "melody: C# Eb G# Bb", 0],
    ["chord symbols", "chords: B♭7♯9 E♭/G", "chords: Bb7#9 Eb/G", 1],
  ])(
    "writes %s with glyphs as the ASCII spelling",
    async (_, glyphs, ascii, slot) => {
      const { notation } = await createAndReadback(
        ctx,
        `t${EMPTY_MIDI_TRACK}/s${slot}`,
        glyphs,
        "stark",
        interpretNotation,
      );

      expect(pitchesOf(notation)).toStrictEqual(pitchesOf(ascii));
      expect(pitchesOf(ascii).length).toBeGreaterThan(0);
    },
  );
});
