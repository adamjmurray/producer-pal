// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
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
  getToolWarnings,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import {
  createClipInSlot,
  readClipNotes,
} from "../helpers/ppal-clip-transforms-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import { arrangementStartOf } from "../helpers/arrangement-start-test-helpers.ts";

const ctx = setupMcpTestContext();

// Two off-grid notes used by the quantization tests.
const OFF_GRID_NOTES = "C3 1|1.25\nD3 1|2.75";

/** Read a clip's serialized notes. */
const readNotes = (clipId: string): Promise<string> =>
  readClipNotes(ctx, clipId);

/**
 * Create a 1-bar clip holding off-grid notes for a quantization test.
 * @param sceneIndex - Session scene index on the empty MIDI track
 * @param notes - Off-grid bar|beat notation
 * @returns The new clip's id
 */
function createOffGridClip(sceneIndex: number, notes: string): Promise<string> {
  return createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s${sceneIndex}`, {
    notes,
    length: "1bar",
  });
}

/**
 * Assert a full-strength 1/4 snap of {@link OFF_GRID_NOTES}: beat 1.25 lands on
 * beat 1 and beat 2.75 on beat 3, with neither off-grid position left behind.
 * @param notes - The read-back notes string
 */
function expectSnappedToQuarters(notes: string): void {
  expect(notes).not.toContain("1|1.25");
  expect(notes).not.toContain("1|2.75");
  expect(notes).toContain("1|1");
  expect(notes).toContain("1|3");
}

/**
 * Resets a clip back to the off-grid notes (clearing existing notes with a v0
 * preTransform), then applies a full-strength quantize on the given grid.
 */
async function resetOffGridAndQuantize(
  clipId: string,
  quantizeGrid: string,
): Promise<void> {
  await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { id: clipId, preTransforms: "v0", notes: OFF_GRID_NOTES },
  });

  await sleep(100);

  await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { id: clipId, quantize: 1.0, quantizeGrid },
  });

  await sleep(100);
}

describe("ppal-update-clip", () => {
  it("updates MIDI clip basic properties", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s0`, {
      notes: "C3 D3 1|1",
      looping: true,
      length: "2bar",
    });

    // Test 1: Update clip name
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, name: "Renamed Clip" },
    });

    await sleep(100);
    const verifyName = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clipId },
    });
    const namedClip = parseToolResult<ReadClipResult>(verifyName);

    expect(namedClip.name).toBe("Renamed Clip");

    // Test 2: Update clip color
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, color: "#00FF00" },
    });

    await sleep(100);
    const verifyColor = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clipId, include: ["color"] },
    });
    const coloredClip = parseToolResult<ReadClipResult>(verifyColor);

    expect(coloredClip.color).toBeDefined();

    // Test 3: Update looping state
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, looping: false },
    });

    await sleep(100);
    const verifyLooping = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clipId, include: ["timing"] },
    });
    const nonLoopingClip = parseToolResult<ReadClipResult>(verifyLooping);

    expect(nonLoopingClip.looping).toBe(false);

    // Test 4: Update start and length
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, start: "1|2", length: "1bar" },
    });

    await sleep(100);
    const verifyStartLength = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clipId, include: ["timing"] },
    });
    const startLengthClip = parseToolResult<ReadClipResult>(verifyStartLength);

    expect(startLengthClip.start).toBe("1|2");
    expect(startLengthClip.length).toBe("1bar");
  });

  it("updates MIDI clip notes", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s1`, {
      notes: "C3 D3 1|1",
      length: "2bar",
    });

    // Test 1: Add notes (merges with existing, verify notes increase)
    const beforeMerge = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clipId, include: ["notes"] },
    });
    const beforeMergeClip = parseToolResult<ReadClipResult>(beforeMerge);

    expect(beforeMergeClip.notes).toBeDefined();

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, notes: "G3 A3 1|3" },
    });

    await sleep(100);

    // After merging G3 A3 into C3 D3, notes should contain all four
    expect(await readNotes(clipId)).toContain("G3");

    // Test 2: Clear all existing notes (preTransforms v0) then write new ones
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, preTransforms: "v0", notes: "C4 1|1" },
    });

    await sleep(100);

    const replacedNotes = await readNotes(clipId);

    expect(replacedNotes).toContain("C4");
    // The cleared notes (e.g. the G3 merged in above) should be gone
    expect(replacedNotes).not.toContain("G3");

    // Test 3: Quantize notes
    // First clear and add some off-grid notes, then snap to a 1/4 grid
    await resetOffGridAndQuantize(clipId, "1/4");

    // Full-strength 1/4 snap: beat 1.25 -> beat 1 (1|1), beat 2.75 -> beat 3
    // (1|3). The off-grid decimal positions must be gone.
    expectSnappedToQuarters(await readNotes(clipId));
  });

  it("quantizes MIDI notes using n/N grid aliases", async () => {
    // Setup: a clip with two off-grid notes on the empty MIDI track
    const clipId = await createOffGridClip(6, OFF_GRID_NOTES);

    // n/4 is the note-value alias for the native 1/4 grid (bridged in
    // handleQuantization). Full-strength snap: 1.25 -> beat 1, 2.75 -> beat 3.
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, quantize: 1.0, quantizeGrid: "n/4" },
    });

    await sleep(100);
    expectSnappedToQuarters(await readNotes(clipId));

    // n/12 is the alias for the 1/8T eighth-triplet grid (no decimal spelling).
    // Reset the off-grid notes, then snap to triplets: 1.25 -> beat 1+1/3
    // (1|1+n/12), 2.75 -> beat 2+2/3 (1|2+n/6).
    await resetOffGridAndQuantize(clipId, "n/12");

    const tripletNotes = await readNotes(clipId);

    expect(tripletNotes).not.toContain("1|1.25");
    expect(tripletNotes).not.toContain("1|2.75");
    expect(tripletNotes).toContain("1|1+n/12");
    expect(tripletNotes).toContain("1|2+n/6");
  });

  it("quantizes at full strength when only quantizeGrid is given", async () => {
    // quantizeGrid alone must move notes (strength defaults to 1).
    const clipId = await createOffGridClip(6, OFF_GRID_NOTES);

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, quantizeGrid: "1/4" },
    });

    await sleep(100);
    expectSnappedToQuarters(await readNotes(clipId));
  });

  it("limits quantization to a single pitch with quantizePitch", async () => {
    // Two off-grid notes at different pitches and positions.
    const clipId = await createOffGridClip(7, "C3 1|1.25\nE3 1|2.75");

    // Quantize only C3 to the 1/4 grid: C3 snaps from beat 1.25 to beat 1
    // (1|1); E3 is a different pitch, so it stays off-grid at 1|2.75.
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        id: clipId,
        quantize: 1.0,
        quantizeGrid: "1/4",
        quantizePitch: "C3",
      },
    });

    await sleep(100);

    const quantizedNotes = await readNotes(clipId);

    // C3 moved onto the grid...
    expect(quantizedNotes).not.toContain("1|1.25");
    expect(quantizedNotes).toContain("1|1");
    // ...but E3 was left untouched at its off-grid position.
    expect(quantizedNotes).toContain("1|2.75");
  });

  it("updates arrangement clip position and length", async () => {
    // Setup: Create an arrangement clip
    const arrCreateResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}`,
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
      arguments: { id: arrClip.id, arrangementStart: "45|1" },
    });
    const movedClip = parseToolResult<{ id: string }>(moveResult);

    await sleep(200);

    // Verify the new clip is at the new position
    const verifyMove = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: movedClip.id },
    });
    const movedClipResult = parseToolResult<ReadClipResult>(verifyMove);

    expect(arrangementStartOf(movedClipResult)).toBe("45|1");
    expect(movedClipResult.view).toBe("arrangement");

    // Test 2: Update arrangement clip length
    const lengthUpdateResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: movedClip.id, arrangementLength: "4bar" },
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
      arguments: { id: firstUpdatedClip!.id, include: ["timing"] },
    });
    const lengthClipResult = parseToolResult<ReadClipResult>(verifyLength);

    expect(lengthClipResult.arrangementLength).toBeDefined();
  });

  it("updates multiple clips in batch", async () => {
    const clip1Id = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s2`, {
      notes: "C3 1|1",
    });
    const clip2Id = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s3`, {
      notes: "E3 1|1",
    });

    // Test: Update multiple clips with comma-separated IDs
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: `${clip1Id},${clip2Id}`, name: "Batch Updated" },
    });

    await sleep(100);
    const verifyBatch1 = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clip1Id },
    });
    const verifyBatch2 = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clip2Id },
    });
    const batchClip1 = parseToolResult<ReadClipResult>(verifyBatch1);
    const batchClip2 = parseToolResult<ReadClipResult>(verifyBatch2);

    expect(batchClip1.name).toBe("Batch Updated");
    expect(batchClip2.name).toBe("Batch Updated");
  });

  it("moves session clip with toPath", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s4`, {
      notes: "C3 D3 1|1",
      name: "Move Me",
    });

    // Move clip from scene 4 to scene 5 on the same track
    const moveResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, toPath: `t${EMPTY_MIDI_TRACK}/s5` },
    });
    const movedClip = parseToolResult<{
      id: string;
      path: string;
    }>(moveResult);

    // Update result should include the destination path
    expect(movedClip.path).toBe(`t${EMPTY_MIDI_TRACK}/s5`);
    expect(movedClip.id).not.toBe(clipId); // new clip ID after move

    await sleep(100);

    // Verify the clip is at the new location with correct properties
    const verifyNew = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: movedClip.id },
    });
    const newClip = parseToolResult<ReadClipResult>(verifyNew);

    expect(newClip.name).toBe("Move Me");
    expect(newClip.path).toBe(`t${EMPTY_MIDI_TRACK}/s5`);

    // Verify the original slot is now empty
    const verifyOld = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: `t${EMPTY_MIDI_TRACK}/s4` },
    });
    const { data: oldSlot } =
      parseToolResultWithWarnings<ReadClipResult>(verifyOld);

    expect(oldSlot.id).toBeNull();
  });

  it("warns instead of throwing when toPath isn't a clip slot", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s6`, {
      notes: "C3 1|1",
      name: "Stay Put",
    });

    // "t7" names an arrangement lane, and a session clip can't move onto one —
    // so the move is skipped and the rest of the update still lands.
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, toPath: "t7", name: "Renamed Anyway" },
    });
    const { data, warnings } = parseToolResultWithWarnings<{
      id: string;
      slot?: string;
    }>(result);

    expect(isToolError(result)).toBe(false);
    expect(warnings.join(" ")).toContain(
      "names an arrangement lane, so session clip",
    );

    await sleep(100);

    const verify = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: data.id },
    });
    const stayed = parseToolResult<ReadClipResult>(verify);

    expect(stayed.path).toBe(`t${EMPTY_MIDI_TRACK}/s6`);
    expect(stayed.name).toBe("Renamed Anyway");
  });

  it("still honors the deprecated toSlot, and says so", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s6`, {
      notes: "C3 1|1",
    });

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, toSlot: `${EMPTY_MIDI_TRACK}/7` },
    });

    expect(
      parseToolResultWithWarnings<{ path: string }>(result).data.path,
    ).toBe(`t${EMPTY_MIDI_TRACK}/s7`);
    expect(getToolWarnings(result)).toContainEqual(
      expect.stringContaining('param "toSlot" is deprecated'),
    );
  });

  it("updates audio clip properties", async () => {
    // Setup: Create an audio track and audio clip
    const audioTrackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name: "Audio Update Test Track" },
    });
    const audioTrack = parseToolResult<CreateTrackResult>(audioTrackResult);

    await sleep(100);

    const audioClipId = await createClipInSlot(ctx, `${audioTrack.path}/s0`, {
      sampleFile: SAMPLE_FILE,
    });

    // Test 1: Update audio clip gain
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: audioClipId, gainDb: -6 },
    });

    await sleep(100);
    const verifyGain = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: audioClipId, include: ["sample"] },
    });
    const gainClip = parseToolResult<ReadClipResult>(verifyGain);

    expect(gainClip.type).toBe("audio");
    expect(gainClip.gainDb).toBeCloseTo(-6, 0);

    // Test 2: Update audio clip pitch shift (including decimal)
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: audioClipId, pitchShift: 5.5 },
    });

    await sleep(100);
    const verifyPitch = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: audioClipId, include: ["sample"] },
    });
    const pitchClip = parseToolResult<ReadClipResult>(verifyPitch);

    expect(pitchClip.pitchShift).toBeCloseTo(5.5, 1);

    // Test 3: Update warp mode
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: audioClipId, warpMode: "complex" },
    });

    await sleep(100);
    const verifyWarpMode = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: audioClipId, include: ["warp"] },
    });
    const warpModeClip = parseToolResult<ReadClipResult>(verifyWarpMode);

    expect(warpModeClip.warpMode).toBe("complex");

    // Test 4: Toggle warping off and on
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: audioClipId, warping: false },
    });

    await sleep(100);
    const verifyWarpOff = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: audioClipId, include: ["warp"] },
    });
    const warpOffClip = parseToolResult<ReadClipResult>(verifyWarpOff);

    expect(warpOffClip.warping).toBe(false);

    // Turn warping back on
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: audioClipId, warping: true },
    });

    await sleep(100);
    const verifyWarpOn = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: audioClipId, include: ["warp"] },
    });
    const warpOnClip = parseToolResult<ReadClipResult>(verifyWarpOn);

    expect(warpOnClip.warping).toBe(true);
  });
});
