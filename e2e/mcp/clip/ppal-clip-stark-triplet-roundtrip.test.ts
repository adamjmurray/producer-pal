// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E round-trip for Stark triplet (`t`) durations through the real Max V8
 * runtime + Live: create a clip whose notes carry 1/3-beat triplet durations,
 * let Live store them, read them back under Stark notation, and re-interpret.
 *
 * Triplets are the first note-content durations that are NOT exact binary
 * fractions (1/3, 2/3 beat), so this is the real-device fidelity check that unit
 * tests can't cover: does Live faithfully store thirds-of-a-beat onsets and
 * durations with enough precision that the serializer snaps them back to `/8t`
 * and `/4t` — rather than drifting to `/16` plus a compensating `z` rest? The
 * `not.toContain("z")` guard is the sharp assertion: any drift past the snap
 * epsilon would surface as a rest.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track (pitched, no Drum Rack, so it
 * serializes back as a `melody:` line). Slots /0 and /1 are both 4/4.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-stark-triplet-roundtrip
 */
import { afterAll, describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  parseToolResult,
  type ReadClipResult,
  resetConfig,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { emptyMidiTrack } from "./helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

const THIRD = 1 / 3;

// Restore the default notation after this file; the per-test setup already resets
// before each test, so this only tidies the trailing server state.
afterAll(async () => {
  await resetConfig();
});

describe("ppal-create-clip Stark triplet round-trip", () => {
  it("round-trips eighth-note triplets (/8t) as thirds-of-a-beat", async () => {
    const { notation, events } = await createAndReadbackStark(
      `${emptyMidiTrack}/0`,
      "melody /8t: C E G C E G",
    );

    expect(notation).toContain("/8t"); // the triplet survived as a triplet
    expect(notation).not.toContain("z"); // no drift → no compensating rest
    expectEvenlySpaced(events, [60, 64, 67, 60, 64, 67], THIRD);
  });

  it("round-trips quarter-note triplets (/4t) as two-thirds-of-a-beat", async () => {
    const { notation, events } = await createAndReadbackStark(
      `${emptyMidiTrack}/1`,
      "melody /4t: C E G",
    );

    expect(notation).toContain("/4t");
    expect(notation).not.toContain("z");
    expectEvenlySpaced(events, [60, 64, 67], 2 * THIRD);
  });
});

/**
 * Create a MIDI clip with Stark `notes` in `slot`, read it back under Stark
 * notation, and re-interpret the serialized notation into note events. Flips the
 * server to Stark per call (the per-test setup resets it beforehand, so setting
 * it inside the test body is what actually takes effect for the read-back).
 * @param slot - Session slot (trackIndex/sceneIndex)
 * @param notes - Stark notation with triplet durations
 * @returns The read-back Stark notation and its re-interpreted note events
 */
async function createAndReadbackStark(
  slot: string,
  notes: string,
): Promise<{ notation: string; events: NoteEvent[] }> {
  await setConfig({ notation: "stark" });

  const created = parseToolResult<{ id: string }>(
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { slot, notes },
    }),
  );

  await sleep(100);

  const read = parseToolResult<ReadClipResult>(
    await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: created.id, include: ["notes"] },
    }),
  );
  const notation = read.notes ?? "";

  // Stark note values are absolute (meter-invariant), so no time signature is
  // needed to re-interpret.
  return { notation, events: interpretNotation(notation) };
}

/**
 * Assert time-sorted `events` match `pitches` at a constant `step`-beat spacing,
 * each sustaining `step` beats, within float tolerance for the device round-trip.
 * @param events - Re-interpreted read-back note events
 * @param pitches - Expected MIDI pitches in time order
 * @param step - Expected onset spacing and duration in beats (the triplet value)
 */
function expectEvenlySpaced(
  events: NoteEvent[],
  pitches: number[],
  step: number,
): void {
  const sorted = [...events].sort((a, b) => a.start_time - b.start_time);

  expect(sorted).toHaveLength(pitches.length);

  sorted.forEach((event, i) => {
    expect(event.pitch).toBe(pitches[i]);
    expect(event.start_time).toBeCloseTo(i * step, 3);
    expect(event.duration).toBeCloseTo(step, 3);
  });
}
