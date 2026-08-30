// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for `clip.duration` in a transform on an unwarped audio clip.
 *
 * The transform context measures a session clip with `clipLengthBeats`, which
 * goes through the markers for audio. Only real Live shows why: its own
 * `Clip.length` is in beats but stale once warping is off, and the markers it
 * has to be read from instead are in seconds. A mock can report whatever the
 * test asks it to.
 *
 * `gain` is the assertion channel because an audio transform has nothing else
 * to write to. Reading gain in dB as a beat count is meaningless musically —
 * it is just how the duration the expression saw gets back out of Live.
 *
 * Uses: e2e-test-set - t5 "Audio 2" (free slots)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-transforms-audio-unwarped
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  createUnwarpedDrumLoop,
  DRUM_LOOP_BEATS,
  halveDrumLoopRegion,
} from "../helpers/audio-warp-test-helpers.ts";
import { AUDIO_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

const SLOT = `t${AUDIO_TRACK}/s1`;

/**
 * Apply a transform to a clip and read its gain back.
 * @param clipId - The clip to transform
 * @param transforms - The transform expression
 * @returns The clip's gain in dB after the transform
 */
async function transformAndReadGain(
  clipId: string,
  transforms: string,
): Promise<number> {
  await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { id: clipId, transforms },
  });

  await sleep(100);

  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { id: clipId, include: ["sample"] },
  });

  return parseToolResult<ReadClipResult>(result).gainDb!;
}

describe("clip transforms on an unwarped audio clip", () => {
  it("measures clip.duration from the markers, in beats", async () => {
    const clipId = await createUnwarpedDrumLoop(ctx.client!, SLOT);

    // Whole sample. The markers hold 2.2222 seconds, which is 4 beats at 108
    // BPM — read them without converting and the expression sees 2.22.
    expect(
      await transformAndReadGain(clipId, "gain = clip.duration"),
    ).toBeCloseTo(DRUM_LOOP_BEATS, 1);

    // Half the sample. Live still reports Clip.length as the full 4 beats here,
    // so this is the assertion that separates the markers from the stale value.
    await halveDrumLoopRegion(ctx.client!, clipId);

    expect(
      await transformAndReadGain(clipId, "gain = clip.duration"),
    ).toBeCloseTo(DRUM_LOOP_BEATS / 2, 1);
  });
});
