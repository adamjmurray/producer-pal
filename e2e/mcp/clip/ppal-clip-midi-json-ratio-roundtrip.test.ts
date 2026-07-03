// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E round-trip for MIDI JSON ratio durations through the real Max V8 runtime +
 * Live: create a clip whose notes carry 1/3-beat triplet durations written as
 * ratios (`d:1/3`), let Live store them, read them back under MIDI JSON notation,
 * and re-interpret.
 *
 * Ratios are the fix for MIDI JSON's float-only fields: a triplet duration used
 * to serialize as a lossy `d:0.3333`; now it round-trips as the exact `d:1/3`.
 * This is the real-device fidelity check unit tests can't cover — does Live store
 * thirds-of-a-beat with enough precision that the serializer snaps them back to a
 * ratio? The `not.toContain(".")` guard is the sharp assertion: every value in a
 * pure-triplet clip is an integer or a ratio, so ANY drift to a decimal would
 * surface a `.` in the read-back string.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track. Slots /0 and /1 are both 4/4,
 * where musical beats == Ableton beats. See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-midi-json-ratio-roundtrip
 */
import { afterAll, describe, expect, it } from "vitest";
import { interpretMidiJson } from "#src/notation/midi-json/midi-json-notation.ts";
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

describe("ppal-create-clip MIDI JSON ratio round-trip", () => {
  it("round-trips eighth-note triplets (d:1/3) as thirds-of-a-beat", async () => {
    const { notation, events } = await createAndReadbackMidiJson(
      `${emptyMidiTrack}/0`,
      "[{p:60,t:0,d:1/3,v:100},{p:64,t:1/3,d:1/3,v:100}," +
        "{p:67,t:2/3,d:1/3,v:100},{p:60,t:1,d:1/3,v:100}," +
        "{p:64,t:4/3,d:1/3,v:100},{p:67,t:5/3,d:1/3,v:100}]",
    );

    expect(notation).toContain("d:1/3"); // the ratio survived as a ratio
    expect(notation).toContain("t:2/3");
    expect(notation).not.toContain("."); // no drift → no decimal anywhere
    expectEvenlySpaced(events, [60, 64, 67, 60, 64, 67], THIRD);
  });

  it("round-trips quarter-note triplets (d:2/3) as two-thirds-of-a-beat", async () => {
    const { notation, events } = await createAndReadbackMidiJson(
      `${emptyMidiTrack}/1`,
      "[{p:60,t:0,d:2/3,v:100},{p:64,t:2/3,d:2/3,v:100}," +
        "{p:67,t:4/3,d:2/3,v:100}]",
    );

    expect(notation).toContain("d:2/3");
    expect(notation).toContain("t:4/3");
    expect(notation).not.toContain(".");
    expectEvenlySpaced(events, [60, 64, 67], 2 * THIRD);
  });
});

/**
 * Create a MIDI clip with MIDI JSON `notes` in `slot`, read it back under MIDI
 * JSON notation, and re-interpret the serialized notation into note events. Flips
 * the server to MIDI JSON per call (the per-test setup resets it beforehand, so
 * setting it inside the test body is what actually takes effect for the read-back).
 * @param slot - Session slot (trackIndex/sceneIndex)
 * @param notes - MIDI JSON notation with ratio durations
 * @returns The read-back MIDI JSON notation and its re-interpreted note events
 */
async function createAndReadbackMidiJson(
  slot: string,
  notes: string,
): Promise<{ notation: string; events: NoteEvent[] }> {
  await setConfig({ notation: "midi-json" });

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

  // The slot is 4/4, so musical beats == Ableton beats and the default
  // denominator re-interprets the read-back notation faithfully.
  return { notation, events: interpretMidiJson(notation) };
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
