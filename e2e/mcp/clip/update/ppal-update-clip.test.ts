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
  parseToolResultWithWarnings,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

// Use t8 "9-MIDI" which is empty in e2e-test-set
const emptyMidiTrack = 8;

describe("ppal-update-clip", () => {
  it("updates MIDI clip basic properties", async () => {
    // Setup: Create a clip for testing
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/0`,
        notes: "C3 D3 1|1",
        looping: true,
        length: "2bar",
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
      arguments: { ids: clip.id, start: "1|2", length: "1bar" },
    });

    await sleep(100);
    const verifyStartLength = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["timing"] },
    });
    const startLengthClip = parseToolResult<ReadClipResult>(verifyStartLength);

    expect(startLengthClip.start).toBe("1|2");
    expect(startLengthClip.length).toBe("1bar");
  });

  it("updates MIDI clip notes", async () => {
    // Setup: Create a clip for testing
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/1`,
        notes: "C3 D3 1|1",
        length: "2bar",
      },
    });
    const clip = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    // Test 1: Add notes (merges with existing, verify notes increase)
    const beforeMerge = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["notes"] },
    });
    const beforeMergeClip = parseToolResult<ReadClipResult>(beforeMerge);

    expect(beforeMergeClip.notes).toBeDefined();

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, notes: "G3 A3 1|3" },
    });

    await sleep(100);
    const verifyMerge = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["notes"] },
    });
    const mergedClip = parseToolResult<ReadClipResult>(verifyMerge);

    // After merging G3 A3 into C3 D3, notes should contain all four
    expect(mergedClip.notes).toContain("G3");

    // Test 2: Clear all existing notes (preTransforms v0) then write new ones
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, preTransforms: "v0", notes: "C4 1|1" },
    });

    await sleep(100);
    const verifyReplace = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["notes"] },
    });
    const replacedClip = parseToolResult<ReadClipResult>(verifyReplace);

    expect(replacedClip.notes).toContain("C4");
    // The cleared notes (e.g. the G3 merged in above) should be gone
    expect(replacedClip.notes).not.toContain("G3");

    // Test 3: Quantize notes
    // First clear and add some off-grid notes
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip.id,
        preTransforms: "v0",
        notes: "C3 1|1.25\nD3 1|2.75",
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
      arguments: { clipId: clip.id, include: ["notes"] },
    });
    const quantizedClip = parseToolResult<ReadClipResult>(verifyQuantize);

    // Full-strength 1/4 snap: beat 1.25 -> beat 1 (1|1), beat 2.75 -> beat 3
    // (1|3). The off-grid decimal positions must be gone.
    expect(quantizedClip.notes).not.toContain("1|1.25");
    expect(quantizedClip.notes).not.toContain("1|2.75");
    expect(quantizedClip.notes).toContain("1|1");
    expect(quantizedClip.notes).toContain("1|3");
  });

  it("quantizes MIDI notes using n/N grid aliases", async () => {
    // Setup: a clip with two off-grid notes on the empty MIDI track
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/6`,
        notes: "C3 1|1.25\nD3 1|2.75",
        length: "1bar",
      },
    });
    const clip = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    // n/4 is the note-value alias for the native 1/4 grid (bridged in
    // handleQuantization). Full-strength snap: 1.25 -> beat 1, 2.75 -> beat 3.
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, quantize: 1.0, quantizeGrid: "n/4" },
    });

    await sleep(100);
    const verifyQuarter = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["notes"] },
    });
    const quarterClip = parseToolResult<ReadClipResult>(verifyQuarter);

    expect(quarterClip.notes).not.toContain("1|1.25");
    expect(quarterClip.notes).not.toContain("1|2.75");
    expect(quarterClip.notes).toContain("1|1");
    expect(quarterClip.notes).toContain("1|3");

    // n/12 is the alias for the 1/8T eighth-triplet grid (no decimal spelling).
    // Reset the off-grid notes, then snap to triplets: 1.25 -> beat 1+1/3
    // (1|1+n/12), 2.75 -> beat 2+2/3 (1|2+n/6).
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip.id,
        preTransforms: "v0",
        notes: "C3 1|1.25\nD3 1|2.75",
      },
    });

    await sleep(100);

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, quantize: 1.0, quantizeGrid: "n/12" },
    });

    await sleep(100);
    const verifyTriplet = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["notes"] },
    });
    const tripletClip = parseToolResult<ReadClipResult>(verifyTriplet);

    expect(tripletClip.notes).not.toContain("1|1.25");
    expect(tripletClip.notes).not.toContain("1|2.75");
    expect(tripletClip.notes).toContain("1|1+n/12");
    expect(tripletClip.notes).toContain("1|2+n/6");
  });

  it("limits quantization to a single pitch with quantizePitch", async () => {
    // Two off-grid notes at different pitches and positions.
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/7`,
        notes: "C3 1|1.25\nE3 1|2.75",
        length: "1bar",
      },
    });
    const clip = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    // Quantize only C3 to the 1/4 grid: C3 snaps from beat 1.25 to beat 1
    // (1|1); E3 is a different pitch, so it stays off-grid at 1|2.75.
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clip.id,
        quantize: 1.0,
        quantizeGrid: "1/4",
        quantizePitch: "C3",
      },
    });

    await sleep(100);
    const verify = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: clip.id, include: ["notes"] },
    });
    const quantizedClip = parseToolResult<ReadClipResult>(verify);

    // C3 moved onto the grid...
    expect(quantizedClip.notes).not.toContain("1|1.25");
    expect(quantizedClip.notes).toContain("1|1");
    // ...but E3 was left untouched at its off-grid position.
    expect(quantizedClip.notes).toContain("1|2.75");
  });

  it("updates arrangement clip position and length", async () => {
    // Setup: Create an arrangement clip
    const arrCreateResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        trackIndex: emptyMidiTrack,
        arrangementStart: "41|1",
        notes: "C3 1|1",
        length: "2bar",
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
      arguments: { ids: movedClip.id, arrangementLength: "4bar" },
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
        slot: `${emptyMidiTrack}/2`,
        notes: "C3 1|1",
      },
    });
    const clip1 = parseToolResult<{ id: string }>(createResult1);

    const createResult2 = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/3`,
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

  it("moves session clip with toSlot", async () => {
    // Setup: Create a clip at scene 4 on the empty MIDI track
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${emptyMidiTrack}/4`,
        notes: "C3 D3 1|1",
        name: "Move Me",
      },
    });
    const clip = parseToolResult<{ id: string }>(createResult);

    await sleep(100);

    // Move clip from scene 4 to scene 5 on the same track
    const moveResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clip.id, toSlot: `${emptyMidiTrack}/5` },
    });
    const movedClip = parseToolResult<{
      id: string;
      slot: string;
    }>(moveResult);

    // Update result should include destination slot info
    expect(movedClip.slot).toBe(`${emptyMidiTrack}/5`);
    expect(movedClip.id).not.toBe(clip.id); // new clip ID after move

    await sleep(100);

    // Verify the clip is at the new location with correct properties
    const verifyNew = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: movedClip.id },
    });
    const newClip = parseToolResult<ReadClipResult>(verifyNew);

    expect(newClip.name).toBe("Move Me");
    expect(newClip.slot).toBe(`${emptyMidiTrack}/5`);

    // Verify the original slot is now empty
    const verifyOld = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { slot: `${emptyMidiTrack}/4` },
    });
    const { data: oldSlot } =
      parseToolResultWithWarnings<ReadClipResult>(verifyOld);

    expect(oldSlot.id).toBeNull();
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
        slot: `${audioTrack.trackIndex}/0`,
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
