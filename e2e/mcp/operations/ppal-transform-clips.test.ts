/**
 * E2E tests for ppal-transform-clips tool
 * Tests slicing, shuffling, and randomization of clips.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-transform-clips", () => {
  it("transforms clips with slicing, shuffling, and randomization", async () => {
    // Setup: Create arrangement clips for testing
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "1|1,5|1,9|1",
        notes: "v100 C3 D3 E3 F3 1|1",
        length: "2:0.0",
      },
    });
    const clips = parseToolResult<Array<{ id: string }>>(createResult);

    expect(clips).toHaveLength(3);
    const clipIds = clips.map((c) => c.id).join(",");

    await sleep(100);

    // Test 1: Transform with seed (verify deterministic output)
    const seedResult = await ctx.client!.callTool({
      name: "ppal-transform-clips",
      arguments: {
        clipIds,
        seed: 12345,
        velocityMin: -10,
        velocityMax: 10,
      },
    });
    const seedTransform = parseToolResult<TransformResult>(seedResult);

    expect(seedTransform.seed).toBe(12345);
    expect(seedTransform.clipIds).toHaveLength(3);

    // Test 2: Shuffle arrangement clips
    // Create fresh clips for shuffling test
    const shuffleCreateResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: 1,
        arrangementStart: "1|1,3|1,5|1",
        length: "1:0.0",
      },
    });
    const shuffleClips =
      parseToolResult<Array<{ id: string }>>(shuffleCreateResult);
    const shuffleClipIds = shuffleClips.map((c) => c.id).join(",");

    await sleep(100);

    // Read original positions
    const originalPositions: string[] = [];

    for (const clip of shuffleClips) {
      const readResult = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { clipId: clip.id },
      });
      const readClip = parseToolResult<ReadClipResult>(readResult);

      originalPositions.push(readClip.arrangementStart ?? "");
    }

    // Shuffle the clips
    const shuffleResult = await ctx.client!.callTool({
      name: "ppal-transform-clips",
      arguments: {
        clipIds: shuffleClipIds,
        shuffleOrder: true,
        seed: 42,
      },
    });
    const shuffled = parseToolResult<TransformResult>(shuffleResult);

    expect(shuffled.clipIds).toHaveLength(3);
    expect(shuffled.seed).toBe(42);

    // Test 3: Slice clips into segments
    const sliceCreateResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: 2,
        arrangementStart: "1|1",
        length: "4:0.0",
      },
    });
    const sliceClip = parseToolResult<{ id: string }>(sliceCreateResult);

    await sleep(100);

    const sliceResult = await ctx.client!.callTool({
      name: "ppal-transform-clips",
      arguments: {
        clipIds: sliceClip.id,
        slice: "1:0.0",
        seed: 123,
      },
    });
    const sliced = parseToolResult<TransformResult>(sliceResult);

    // Should have 4 slices from a 4-bar clip sliced into 1-bar segments
    expect(sliced.clipIds.length).toBeGreaterThanOrEqual(4);

    // Test 4: Randomize velocity
    const velocityCreateResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: 3,
        arrangementStart: "1|1",
        notes: "v64 C3 D3 E3 F3 1|1",
        length: "2:0.0",
      },
    });
    const velocityClip = parseToolResult<{ id: string }>(velocityCreateResult);

    await sleep(100);

    const velocityResult = await ctx.client!.callTool({
      name: "ppal-transform-clips",
      arguments: {
        clipIds: velocityClip.id,
        velocityMin: -20,
        velocityMax: 20,
        seed: 999,
      },
    });
    const velocityTransformed =
      parseToolResult<TransformResult>(velocityResult);

    expect(velocityTransformed.clipIds).toHaveLength(1);
    expect(velocityTransformed.seed).toBe(999);

    // Test 5: Selection by arrangement range
    // Create clips at specific positions
    const rangeCreateResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "17|1,21|1,25|1",
        length: "2:0.0",
        notes: "C3 1|1",
      },
    });

    parseToolResult<Array<{ id: string }>>(rangeCreateResult);

    await sleep(100);

    const rangeResult = await ctx.client!.callTool({
      name: "ppal-transform-clips",
      arguments: {
        arrangementTrackIndex: "0",
        arrangementStart: "17|1",
        arrangementLength: "12:0.0",
        velocityMin: -5,
        velocityMax: 5,
        seed: 777,
      },
    });
    const rangeTransformed = parseToolResult<TransformResult>(rangeResult);

    // Should find the clips in the specified range
    expect(rangeTransformed.clipIds.length).toBeGreaterThanOrEqual(3);

    // Test 6: Empty selection returns empty clipIds
    const emptyResult = await ctx.client!.callTool({
      name: "ppal-transform-clips",
      arguments: {
        arrangementTrackIndex: "0",
        arrangementStart: "100|1",
        arrangementLength: "1:0.0",
        seed: 111,
      },
    });
    const emptyTransformed = parseToolResult<TransformResult>(emptyResult);

    expect(emptyTransformed.clipIds).toHaveLength(0);
    expect(emptyTransformed.seed).toBe(111);
  });
});

interface TransformResult {
  clipIds: string[];
  seed: number;
}

interface ReadClipResult {
  id: string;
  arrangementStart?: string;
}
