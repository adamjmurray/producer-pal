// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for bar|beat pattern brackets (streams) through the
 * real Max V8 runtime: create a clip with bracketed notation, let Live store the
 * notes, read them back, and re-interpret the serialized notation to verify the
 * emitted notes. This exercises the grammar + interpreter in the bundled device
 * (not just unit tests) and confirms the end-to-end contract that brackets are
 * author-only sugar — the read-back notation is always bracket-free explicit
 * notes that re-interpret to the expansion.
 *
 * Covers pitch streams, the velocity/pitch zip, the no-@step duration-fold
 * (gallop), and pitch layering (multiple pitch voices stacking into chords). All
 * cases are overlap-safe (legato-touching or distinct pitches), so they
 * round-trip through Live's add_new_notes without truncation/deletion.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track. Slots /0../5 (avoids /4, the
 * 3/4 scene s4, so all cases stay in 4/4).
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-create-clip-pattern-brackets
 */
import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers.ts";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

interface ExpectedNote {
  pitch: number;
  start: number;
  duration: number;
  velocity?: number;
}

describe("ppal-create-clip pattern brackets (streams)", () => {
  it("expands a pitch stream into a melodic line", async () => {
    const { notation, events } = await createAndReadback(
      `t${EMPTY_MIDI_TRACK}/s0`,
      "n/4 [C3 E3 G3] 1|1x3@n/4",
    );

    expect(notation).not.toMatch(/[[\]]/); // serialized bracket-free
    expectNotes(events, [
      { pitch: 60, start: 0, duration: 1 },
      { pitch: 64, start: 1, duration: 1 },
      { pitch: 67, start: 2, duration: 1 },
    ]);
  });

  it("zips a velocity stream against a pitch stream", async () => {
    const { notation, events } = await createAndReadback(
      `t${EMPTY_MIDI_TRACK}/s1`,
      "n/8 [v80 v100] [C3 E3 G3] 1|1x6@n/8",
    );

    expect(notation).not.toMatch(/[[\]]/);
    expectNotes(events, [
      { pitch: 60, start: 0, duration: 0.5, velocity: 80 },
      { pitch: 64, start: 0.5, duration: 0.5, velocity: 100 },
      { pitch: 67, start: 1, duration: 0.5, velocity: 80 },
      { pitch: 60, start: 1.5, duration: 0.5, velocity: 100 },
      { pitch: 64, start: 2, duration: 0.5, velocity: 80 },
      { pitch: 67, start: 2.5, duration: 0.5, velocity: 100 },
    ]);
  });

  it("folds a no-@step duration stream into the gallop spacing", async () => {
    const { notation, events } = await createAndReadback(
      `t${EMPTY_MIDI_TRACK}/s2`,
      "[n/4 n/8] C3 1|1x8",
    );

    expect(notation).not.toMatch(/[[\]]/);
    expectNotes(events, [
      { pitch: 60, start: 0, duration: 1 },
      { pitch: 60, start: 1, duration: 0.5 },
      { pitch: 60, start: 1.5, duration: 1 },
      { pitch: 60, start: 2.5, duration: 0.5 },
      { pitch: 60, start: 3, duration: 1 },
      { pitch: 60, start: 4, duration: 0.5 },
      { pitch: 60, start: 4.5, duration: 1 },
      { pitch: 60, start: 5.5, duration: 0.5 },
    ]);
  });

  it("layers a held pitch under a moving bracket line", async () => {
    const { notation, events } = await createAndReadback(
      `t${EMPTY_MIDI_TRACK}/s3`,
      "n/4 C4 [E4 G4 C5] 1|1,2,3,4",
    );

    expect(notation).not.toMatch(/[[\]]/);
    // Held C4 (72) layered under the moving line E4/G4/C5/E4.
    expectNotes(events, [
      { pitch: 72, start: 0, duration: 1 },
      { pitch: 76, start: 0, duration: 1 },
      { pitch: 72, start: 1, duration: 1 },
      { pitch: 79, start: 1, duration: 1 },
      { pitch: 72, start: 2, duration: 1 },
      { pitch: 84, start: 2, duration: 1 },
      { pitch: 72, start: 3, duration: 1 },
      { pitch: 76, start: 3, duration: 1 },
    ]);
  });

  it("layers two pitch voices that phase into chords", async () => {
    const { notation, events } = await createAndReadback(
      `t${EMPTY_MIDI_TRACK}/s5`,
      "n/4 [C3 C4] [E3 G3 E4] 1|1,2,3,4",
    );

    expect(notation).not.toMatch(/[[\]]/);
    // Voices [C3 C4] (len 2) and [E3 G3 E4] (len 3) phase: (C3,E3) (C4,G3)
    // (C3,E4) (C4,E3). Listed time-then-pitch sorted.
    expectNotes(events, [
      { pitch: 60, start: 0, duration: 1 },
      { pitch: 64, start: 0, duration: 1 },
      { pitch: 67, start: 1, duration: 1 },
      { pitch: 72, start: 1, duration: 1 },
      { pitch: 60, start: 2, duration: 1 },
      { pitch: 76, start: 2, duration: 1 },
      { pitch: 64, start: 3, duration: 1 },
      { pitch: 72, start: 3, duration: 1 },
    ]);
  });
});

/**
 * Create a MIDI clip with `notes` at `path`, read it back, and re-interpret the
 * serialized notation into note events (in the clip's own meter).
 * @param path - Clip slot path (e.g. "t8/s0")
 * @param notes - bar|beat notation (may contain pattern brackets)
 * @returns The read-back notation string and its re-interpreted note events
 */
async function createAndReadback(
  path: string,
  notes: string,
): Promise<{ notation: string; events: NoteEvent[] }> {
  const clipId = await createClipInSlot(ctx, path, { notes });
  const read = parseToolResult<ReadClipResult>(
    await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clipId, include: ["notes", "timing"] },
    }),
  );
  const notation = read.notes ?? "";
  const [numerator, denominator] = (read.timeSignature ?? "4/4")
    .split("/")
    .map(Number);
  const events = interpretNotation(notation, {
    timeSigNumerator: numerator,
    timeSigDenominator: denominator,
  });

  return { notation, events };
}

/**
 * Assert that `events` (time-then-pitch sorted) match `expected` exactly: same
 * count, pitch, start, duration, and (when given) velocity, within float
 * tolerance for the serialize → re-interpret round-trip.
 * @param events - Note events from the re-interpreted read-back
 * @param expected - Expected notes in time order
 */
function expectNotes(events: NoteEvent[], expected: ExpectedNote[]): void {
  const sorted = events.toSorted(
    (a, b) => a.start_time - b.start_time || a.pitch - b.pitch,
  );

  expect(sorted).toHaveLength(expected.length);

  sorted.forEach((e, i) => {
    const exp = expected[i] as ExpectedNote;

    expect(e.pitch).toBe(exp.pitch);
    expect(e.start_time).toBeCloseTo(exp.start, 6);
    expect(e.duration).toBeCloseTo(exp.duration, 6);

    if (exp.velocity != null) {
      expect(e.velocity).toBeCloseTo(exp.velocity, 6);
    }
  });
}
