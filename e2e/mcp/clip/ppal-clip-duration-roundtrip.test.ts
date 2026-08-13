// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E round-trip tests for the v1.4.11 absolute note-value duration grammar.
 *
 * Create / read / update a MIDI clip's `length` (and `arrangementLength`) with
 * representative durations and verify the read-back string matches: `n/4`,
 * `n/8`, dotted `n/4d` (the plain-fraction input `n3/8` canonicalizes to it on
 * read-back), `1bar+n/4`, and whole-bar `Nbar`. (Audio-clip lengths are
 * covered separately once the audio path is exercised; off-grid lengths
 * are a serializer concern unit-tested in barbeat-time-durations.test.ts.)
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-duration-roundtrip
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import {
  createClipInSlot,
  emptyMidiTrack,
} from "./helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();

/** Read a single timing field (length or arrangementLength) from a clip. */
async function readClipTiming(
  clipId: string,
  field: "length" | "arrangementLength",
): Promise<string | undefined> {
  await sleep(50);

  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["timing"] },
  });

  return parseToolResult<ReadClipResult>(result)[field];
}

/**
 * Create the suite's standard looping session clip at the given length.
 * @param length - Clip length in the absolute note-value duration grammar
 * @returns The new clip's id
 */
function createLoopingClip(length: string): Promise<string> {
  return createClipInSlot(ctx, `${emptyMidiTrack}/0`, {
    notes: "C3 1|1",
    looping: true,
    length,
  });
}

describe("clip duration round-trips (absolute note values)", () => {
  // n/8 (half a beat) is the shortest case here — a sanity check that sub-beat
  // loop lengths round-trip, not just whole/multi-bar ones.
  it.each([
    { length: "n/4" }, // a quarter (1 beat)
    { length: "n/8" }, // an eighth (0.5 beat)
    // The plain fraction n3/8 is still an accepted input, but the serializer
    // canonicalizes a dotted quarter (1.5 beats) to the dotted-sugar n/4d on
    // read-back, so create and read-back strings differ here.
    { length: "n3/8", expected: "n/4d" },
    { length: "1bar+n/4" }, // a bar plus a quarter (5 beats)
    { length: "2bar" }, // two whole bars (8 beats)
  ])(
    "round-trips a session clip length of $length",
    async ({ length, expected }) => {
      const clipId = await createLoopingClip(length);

      expect(await readClipTiming(clipId, "length")).toBe(expected ?? length);
    },
  );

  it("round-trips a session clip length through an update", async () => {
    const clipId = await createLoopingClip("2bar");

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clipId, length: "n/2" },
    });

    await sleep(100);

    expect(await readClipTiming(clipId, "length")).toBe("n/2");
  });

  it("round-trips arrangementLength for an unlooped MIDI clip (create + update)", async () => {
    // Unlooped arrangement clips extend in place via loop_end (single clip, no
    // tiling), so arrangementLength round-trips cleanly through create + update.
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        trackIndex: emptyMidiTrack,
        arrangementStart: "10|1",
        notes: "C3 1|1",
        looping: false,
        length: "2bar",
      },
    });
    const clip = parseToolResult<{ id: string }>(createResult);

    await sleep(200);

    expect(await readClipTiming(clip.id, "arrangementLength")).toBe("2bar");

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, arrangementLength: "4bar" },
    });

    await sleep(200);

    expect(await readClipTiming(clip.id, "arrangementLength")).toBe("4bar");
  });
});
