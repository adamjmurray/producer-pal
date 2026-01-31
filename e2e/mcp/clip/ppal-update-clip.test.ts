/**
 * E2E tests for ppal-update-clip tool
 * Creates clips, updates them, and verifies changes.
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

describe("ppal-update-clip", () => {
  it("updates clip properties and verifies changes", async () => {
    // Setup: Create clips for testing
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        notes: "C3 D3 1|1",
        looping: true,
        length: "2:0.0",
      },
    });
    const clip1 = parseToolResult<{ id: string }>(createResult);

    const createResult2 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: 0,
        sceneIndex: "1",
        notes: "E3 F3 1|1",
      },
    });
    const clip2 = parseToolResult<{ id: string }>(createResult2);

    await sleep(100);

    // Test 1: Update clip name
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip1.id,
        name: "Renamed Clip",
      },
    });

    await sleep(100);
    const verifyName = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip1.id },
    });
    const namedClip = parseToolResult<ReadClipResult>(verifyName);

    expect(namedClip.name).toBe("Renamed Clip");

    // Test 2: Update clip color
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip1.id,
        color: "#00FF00",
      },
    });

    await sleep(100);
    const verifyColor = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip1.id, include: ["color"] },
    });
    const coloredClip = parseToolResult<ReadClipResult>(verifyColor);

    expect(coloredClip.color).toBeDefined();

    // Test 3: Add notes with merge mode (verify noteCount increases)
    const beforeMerge = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip1.id },
    });
    const beforeMergeClip = parseToolResult<ReadClipResult>(beforeMerge);
    const initialNoteCount = beforeMergeClip.noteCount ?? 0;

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip1.id,
        notes: "G3 A3 1|3",
        noteUpdateMode: "merge",
      },
    });

    await sleep(100);
    const verifyMerge = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip1.id },
    });
    const mergedClip = parseToolResult<ReadClipResult>(verifyMerge);

    expect(mergedClip.noteCount).toBeGreaterThan(initialNoteCount);

    // Test 4: Replace notes with noteUpdateMode: "replace"
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip1.id,
        notes: "C4 1|1",
        noteUpdateMode: "replace",
      },
    });

    await sleep(100);
    const verifyReplace = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip1.id },
    });
    const replacedClip = parseToolResult<ReadClipResult>(verifyReplace);

    expect(replacedClip.noteCount).toBe(1);

    // Test 5: Update looping state
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip1.id,
        looping: false,
      },
    });

    await sleep(100);
    const verifyLooping = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip1.id },
    });
    const nonLoopingClip = parseToolResult<ReadClipResult>(verifyLooping);

    expect(nonLoopingClip.looping).toBe(false);

    // Test 6: Update start and length
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip1.id,
        start: "1|2",
        length: "1:0.0",
      },
    });

    await sleep(100);
    const verifyStartLength = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip1.id },
    });
    const startLengthClip = parseToolResult<ReadClipResult>(verifyStartLength);

    expect(startLengthClip.start).toBe("1|2");
    expect(startLengthClip.length).toBe("1:0");

    // Test 7: Update multiple clips with comma-separated IDs
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: `${clip1.id},${clip2.id}`,
        name: "Batch Updated",
      },
    });

    await sleep(100);
    const verifyBatch1 = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip1.id },
    });
    const verifyBatch2 = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip2.id },
    });
    const batchClip1 = parseToolResult<ReadClipResult>(verifyBatch1);
    const batchClip2 = parseToolResult<ReadClipResult>(verifyBatch2);

    expect(batchClip1.name).toBe("Batch Updated");
    expect(batchClip2.name).toBe("Batch Updated");

    // Test 8: Quantize notes
    // First add some off-grid notes
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip1.id,
        notes: "1|1.25 C3\n1|2.75 D3",
        noteUpdateMode: "replace",
      },
    });

    await sleep(100);

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip1.id,
        quantize: 1.0,
        quantizeGrid: "1/4",
      },
    });

    await sleep(100);
    const verifyQuantize = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip1.id, include: ["clip-notes"] },
    });
    const quantizedClip = parseToolResult<ReadClipResult>(verifyQuantize);

    // Notes should be quantized (exact positions depend on implementation)
    expect(quantizedClip.notes).toBeDefined();

    // Test 9: Update arrangement clip position (arrangementStart)
    // Create an arrangement clip for this test
    const arrCreateResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: 1,
        arrangementStart: "1|1",
        notes: "C3 1|1",
        length: "2:0.0",
      },
    });
    const arrClip = parseToolResult<{ id: string }>(arrCreateResult);

    await sleep(200);

    // Move the clip to a new position
    const moveResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: arrClip.id,
        arrangementStart: "5|1",
      },
    });
    const movedClip = parseToolResult<{ id: string }>(moveResult);

    await sleep(200);

    // Verify the new clip is at the new position
    const verifyMove = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: movedClip.id },
    });
    const movedClipResult = parseToolResult<ReadClipResult>(verifyMove);

    expect(movedClipResult.arrangementStart).toBe("5|1");
    expect(movedClipResult.view).toBe("arrangement");

    // Test 10: Update arrangement clip length (arrangementLength)
    const lengthUpdateResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: movedClip.id,
        arrangementLength: "4:0.0",
      },
    });

    // arrangementLength can return multiple clips if it tiles
    const lengthUpdatedClips = parseToolResult<
      { id: string } | Array<{ id: string }>
    >(lengthUpdateResult);
    const firstUpdatedClip = Array.isArray(lengthUpdatedClips)
      ? lengthUpdatedClips[0]
      : lengthUpdatedClips;

    await sleep(200);

    const verifyLength = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: firstUpdatedClip!.id },
    });
    const lengthClipResult = parseToolResult<ReadClipResult>(verifyLength);

    expect(lengthClipResult.arrangementLength).toBeDefined();
  });
});

interface ReadClipResult {
  id: string;
  type: "midi" | "audio";
  name?: string;
  view: "session" | "arrangement";
  color?: string;
  timeSignature?: string;
  looping?: boolean;
  start?: string;
  end?: string;
  length?: string;
  trackIndex?: number;
  sceneIndex?: number;
  arrangementStart?: string;
  arrangementLength?: string;
  noteCount?: number;
  notes?: string;
}
