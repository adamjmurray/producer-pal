// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-clip with velocity transforms and merge
 * Tests the bug fix for "Invalid velocity range" error when merging clips
 * with high velocity values that would exceed MIDI max 127.
 * Uses: e2e-test-set - tests create clips in empty slots (t8 is empty MIDI track)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- --testPathPattern update-clip-merge-velocity
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/**
 * Create a MIDI clip on the empty track and wait for Live to settle.
 * @param sceneIndex - Session scene index for the slot
 * @param notes - Notation string for the clip's notes
 * @param length - Clip length (e.g. "8bar")
 * @returns The created clip's id
 */
async function createClip(
  sceneIndex: number,
  notes: string,
  length: string,
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: { path: `t${EMPTY_MIDI_TRACK}/s${sceneIndex}`, notes, length },
  });
  const clip = parseToolResult<{ id: string }>(result);

  await sleep(100);

  return clip.id;
}

/**
 * Call ppal-update-clip on `clipId` with the given merge/transform arguments.
 * @param clipId - Clip to update
 * @param args - Extra update-clip arguments (notes and/or transforms)
 * @returns The raw tool result
 */
async function updateClip(
  clipId: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { id: clipId, ...args },
  });
}

describe("ppal-update-clip velocity merge", () => {
  it("merges clips with velocity transforms near MIDI upper bound", async () => {
    // Step 1: Create clip with velocity range v80-100
    const clipId = await createClip(
      0,
      "v80-100 Gb1 8|1.25,1.75,2.25,2.75,3.25,3.75,4.25,4.75",
      "8bar",
    );

    // Step 2: Apply transform that increases velocity toward upper bound
    // This should create velocities near 110 (80 + 30 * cos(0) = 110 at start)
    await updateClip(clipId, {
      transforms: "Gb1: velocity += 30 * cos(n/1, sync)",
    });

    await sleep(100);

    // Step 3: Merge with new notes and apply ramp transform
    // Previously failed with "Invalid velocity range 108-128" error
    // because formatNotation would create v108-128 which exceeds MIDI max 127
    const mergeResult = await updateClip(clipId, {
      notes: "C1 1|1",
      transforms: "8|1-8|4 Gb1: velocity += ramp(40, 127)",
    });

    // Should succeed without error
    const merged = parseToolResult<{ id: string; noteCount: number }>(
      mergeResult,
    );

    expect(merged.id).toBe(clipId);
    expect(merged.noteCount).toBeGreaterThan(0);

    // Verify notes were actually merged and transformed
    const readResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clipId, include: ["notes"] },
    });
    const finalClip = parseToolResult<ReadClipResult>(readResult);

    // Original 8 Gb1 notes + new C1 note - should contain both pitches
    expect(finalClip.notes).toContain("Gb1");
    expect(finalClip.notes).toContain("C1");
  });

  it("handles velocity at exact MIDI upper bound (127)", async () => {
    // Create clip with notes at velocity 127
    const clipId = await createClip(1, "v127 C3 D3 E3 1|1", "4bar");

    // Add velocity deviation - should be handled gracefully
    await updateClip(clipId, { transforms: "C3 D3 E3: deviation += 20" });

    await sleep(100);

    // Merge with new notes - should succeed without error
    const mergeResult = await updateClip(clipId, { notes: "F3 2|1" });

    const merged = parseToolResult<{ id: string; noteCount: number }>(
      mergeResult,
    );

    expect(merged.id).toBe(clipId);
    expect(merged.noteCount).toBe(4); // Original 3 + new 1
  });

  it("handles velocity near upper bound with merge and multiple transforms", async () => {
    // Create clip with velocity range near upper bound
    const clipId = await createClip(2, "v100-120 C3 1|1,2,3,4", "4bar");

    // Apply first transform to push velocity higher
    await updateClip(clipId, { transforms: "C3: velocity += 10" });

    await sleep(100);

    // Apply second transform with merge - should clamp to 127
    const mergeResult = await updateClip(clipId, {
      notes: "D3 2|1",
      transforms: "C3: velocity += 5",
    });

    // Should succeed - velocities clamped at 127
    const merged = parseToolResult<{ id: string; noteCount: number }>(
      mergeResult,
    );

    expect(merged.id).toBe(clipId);
    expect(merged.noteCount).toBe(5); // 4 C3 notes + 1 D3 note
  });
});
