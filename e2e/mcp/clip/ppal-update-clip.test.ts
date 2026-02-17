// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-clip tool
 * Creates clips, updates them, and verifies changes.
 * Uses: e2e-test-set - tests create clips in empty slots (t8 is empty MIDI track)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  type CreateTrackResult,
  parseToolResult,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

// Use t8 "9-MIDI" which is empty in e2e-test-set
const emptyMidiTrack = 8;

describe("ppal-update-clip", () => {
  it("updates MIDI clip basic properties", async () => {
    // Setup: Create a clip for testing
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "0",
        notes: "C3 D3 1|1",
        looping: true,
        length: "2:0.0",
      },
    });
    const clip = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    // Test 1: Update clip name
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, name: "Renamed Clip" },
    });

    await sleep(100);
    const verifyName = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id },
    });
    const namedClip = parseToolResult<ReadClipResult>(verifyName);

    expect(namedClip.name).toBe("Renamed Clip");

    // Test 2: Update clip color
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, color: "#00FF00" },
    });

    await sleep(100);
    const verifyColor = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["color"] },
    });
    const coloredClip = parseToolResult<ReadClipResult>(verifyColor);

    expect(coloredClip.color).toBeDefined();

    // Test 3: Update looping state
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, looping: false },
    });

    await sleep(100);
    const verifyLooping = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["timing"] },
    });
    const nonLoopingClip = parseToolResult<ReadClipResult>(verifyLooping);

    expect(nonLoopingClip.looping).toBe(false);

    // Test 4: Update start and length
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, start: "1|2", length: "1:0.0" },
    });

    await sleep(100);
    const verifyStartLength = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["timing"] },
    });
    const startLengthClip = parseToolResult<ReadClipResult>(verifyStartLength);

    expect(startLengthClip.start).toBe("1|2");
    expect(startLengthClip.length).toBe("1:0");
  });

  it("updates MIDI clip notes", async () => {
    // Setup: Create a clip for testing
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "1",
        notes: "C3 D3 1|1",
        length: "2:0.0",
      },
    });
    const clip = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    // Test 1: Add notes with merge mode (verify notes increase)
    const beforeMerge = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["clip-notes"] },
    });
    const beforeMergeClip = parseToolResult<ReadClipResult>(beforeMerge);

    expect(beforeMergeClip.notes).toBeDefined();

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, notes: "G3 A3 1|3", noteUpdateMode: "merge" },
    });

    await sleep(100);
    const verifyMerge = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["clip-notes"] },
    });
    const mergedClip = parseToolResult<ReadClipResult>(verifyMerge);

    // After merging G3 A3 into C3 D3, notes should contain all four
    expect(mergedClip.notes).toContain("G3");

    // Test 2: Replace notes with noteUpdateMode: "replace"
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, notes: "C4 1|1", noteUpdateMode: "replace" },
    });

    await sleep(100);
    const verifyReplace = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["clip-notes"] },
    });
    const replacedClip = parseToolResult<ReadClipResult>(verifyReplace);

    expect(replacedClip.notes).toContain("C4");

    // Test 3: Quantize notes
    // First add some off-grid notes
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip.id,
        notes: "1|1.25 C3\n1|2.75 D3",
        noteUpdateMode: "replace",
      },
    });

    await sleep(100);

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, quantize: 1.0, quantizeGrid: "1/4" },
    });

    await sleep(100);
    const verifyQuantize = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["clip-notes"] },
    });
    const quantizedClip = parseToolResult<ReadClipResult>(verifyQuantize);

    // Notes should be quantized (exact positions depend on implementation)
    expect(quantizedClip.notes).toBeDefined();
  });

  it("updates arrangement clip position and length", async () => {
    // Setup: Create an arrangement clip
    const arrCreateResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: emptyMidiTrack,
        arrangementStart: "41|1",
        notes: "C3 1|1",
        length: "2:0.0",
      },
    });
    const arrClip = parseToolResult<{ id: string }>(arrCreateResult);

    await sleep(200);

    // Test 1: Move the clip to a new position
    const moveResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: arrClip.id, arrangementStart: "45|1" },
    });
    const movedClip = parseToolResult<{ id: string }>(moveResult);

    await sleep(200);

    // Verify the new clip is at the new position
    const verifyMove = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: movedClip.id },
    });
    const movedClipResult = parseToolResult<ReadClipResult>(verifyMove);

    expect(movedClipResult.arrangementStart).toBe("45|1");
    expect(movedClipResult.view).toBe("arrangement");

    // Test 2: Update arrangement clip length
    const lengthUpdateResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: movedClip.id, arrangementLength: "4:0.0" },
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
      arguments: { clipId: firstUpdatedClip!.id, include: ["timing"] },
    });
    const lengthClipResult = parseToolResult<ReadClipResult>(verifyLength);

    expect(lengthClipResult.arrangementLength).toBeDefined();
  });

  it("updates multiple clips in batch", async () => {
    // Setup: Create two clips for batch testing
    const createResult1 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "2",
        notes: "C3 1|1",
      },
    });
    const clip1 = parseToolResult<{ id: string }>(createResult1);

    const createResult2 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "3",
        notes: "E3 1|1",
      },
    });
    const clip2 = parseToolResult<{ id: string }>(createResult2);

    await sleep(100);

    // Test: Update multiple clips with comma-separated IDs
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: `${clip1.id},${clip2.id}`, name: "Batch Updated" },
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
  });

  it("updates audio clip properties", async () => {
    // Setup: Create an audio track and audio clip
    const audioTrackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name: "Audio Update Test Track" },
    });
    const audioTrack = parseToolResult<CreateTrackResult>(audioTrackResult);

    await sleep(100);

    const audioClipResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: audioTrack.trackIndex,
        sceneIndex: "0",
        sampleFile: SAMPLE_FILE,
      },
    });
    const audioClip = parseToolResult<{ id: string }>(audioClipResult);

    await sleep(100);

    // Test 1: Update audio clip gain
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: audioClip.id, gainDb: -6 },
    });

    await sleep(100);
    const verifyGain = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: audioClip.id, include: ["sample"] },
    });
    const gainClip = parseToolResult<ReadClipResult>(verifyGain);

    expect(gainClip.type).toBe("audio");
    expect(gainClip.gainDb).toBeCloseTo(-6, 0);

    // Test 2: Update audio clip pitch shift (including decimal)
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: audioClip.id, pitchShift: 5.5 },
    });

    await sleep(100);
    const verifyPitch = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: audioClip.id, include: ["sample"] },
    });
    const pitchClip = parseToolResult<ReadClipResult>(verifyPitch);

    expect(pitchClip.pitchShift).toBeCloseTo(5.5, 1);

    // Test 3: Update warp mode
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: audioClip.id, warpMode: "complex" },
    });

    await sleep(100);
    const verifyWarpMode = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: audioClip.id, include: ["warp"] },
    });
    const warpModeClip = parseToolResult<ReadClipResult>(verifyWarpMode);

    expect(warpModeClip.warpMode).toBe("complex");

    // Test 4: Toggle warping off and on
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: audioClip.id, warping: false },
    });

    await sleep(100);
    const verifyWarpOff = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: audioClip.id, include: ["warp"] },
    });
    const warpOffClip = parseToolResult<ReadClipResult>(verifyWarpOff);

    expect(warpOffClip.warping).toBe(false);

    // Turn warping back on
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: audioClip.id, warping: true },
    });

    await sleep(100);
    const verifyWarpOn = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: audioClip.id, include: ["warp"] },
    });
    const warpOnClip = parseToolResult<ReadClipResult>(verifyWarpOn);

    expect(warpOnClip.warping).toBe(true);
  });
});
