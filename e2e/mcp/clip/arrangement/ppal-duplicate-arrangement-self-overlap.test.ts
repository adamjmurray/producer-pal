// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for self-overlapping arrangement clip duplicate/move.
 *
 * Placing a clip at a position overlapping its OWN arrangement range routes
 * through a holding area so the original is overwritten (trimmed where the copy
 * lands) and a FULL-length copy goes to the target — instead of crashing Ableton
 * or truncating the copy.
 *
 * Desired behavior for a 4-bar clip, +1 bar forward:
 *   - duplicate → 1-bar original (its first bar) + full 4-bar copy (2 clips)
 *   - move      → single full 4-bar clip at the new position (original gone)
 *
 * Uses: e2e-test-set (t8 = empty MIDI track, t5 = audio track with sample)
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-arrangement-self-overlap
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  type ArrangementClipResult,
  beats,
  callTool,
  clipAt,
  clipsInBarRange,
  duplicateClipToArrangement,
  lengthBeats,
  readArrangementClips,
} from "../helpers/arrangement-clip-query-test-helpers.ts";
import { AUDIO_TRACK, EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import { arrangementStartOf } from "../helpers/arrangement-start-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

describe("self-overlapping arrangement clip duplicate/move", () => {
  let midi4barId: string; // 4-bar MIDI session clip
  let audioId: string; // session sample clip on t5/s0

  beforeAll(async () => {
    const midi = await callTool(ctx.client!, "ppal-create-clip", {
      path: `t${EMPTY_MIDI_TRACK}/s0`,
      notes: "C3 1|1 E3 2|1 G3 3|1 B3 4|1",
      length: "4bar",
    });

    midi4barId = parseToolResult<{ id: string }>(midi).id;

    const sample = await callTool(ctx.client!, "ppal-read-clip", {
      path: `t${AUDIO_TRACK}/s0`,
    });

    audioId = parseToolResult<{ id: string }>(sample).id;
    await sleep(150);
  });

  it("duplicate +1 bar trims the original and keeps a full 4-bar copy", async () => {
    // 4-bar clip at 5|1 ([5|1, 9|1]), duplicated to 6|1 — overlaps itself.
    const base = await dupToArr(midi4barId, "5|1");
    const copy = await dupToArr(base.id, "6|1");

    expect(copy.id).toBeDefined();
    expect(arrangementStartOf(copy)).toBe("6|1");

    const clips = clipsInBarRange(await readArrClips(EMPTY_MIDI_TRACK), 5, 10);

    // Exactly two clips: the trimmed original at 5|1 and the full copy at 6|1.
    expect(clips).toHaveLength(2);

    // Original overwritten down to its first bar; copy stays full length.
    expect(lengthBeats(clipAt(clips, "5|1"))).toBeCloseTo(beats("1bar"), 5);
    expect(lengthBeats(clipAt(clips, "6|1"))).toBeCloseTo(beats("4bar"), 5);

    // The full copy keeps its bar-4 note — proof it was not truncated to 1 bar.
    const copyNotes = (await readClip(copy.id, ["notes"])).notes ?? "";

    expect(copyNotes).toContain("B3");
  });

  it("move +1 bar relocates to a single full 4-bar clip", async () => {
    // 4-bar clip at 15|1, moved to 16|1 — overlaps itself.
    const base = await dupToArr(midi4barId, "15|1");

    await moveArrClip(base.id, "16|1");

    const clips = clipsInBarRange(await readArrClips(EMPTY_MIDI_TRACK), 15, 20);

    // A move leaves exactly one clip — the full copy at the new position.
    expect(clips).toHaveLength(1);

    const moved = clips[0]!;

    expect(arrangementStartOf(moved)).toBe("16|1");
    expect(lengthBeats(moved)).toBeCloseTo(beats("4bar"), 5);

    // The relocated clip keeps its bar-4 note (full length, not truncated).
    const movedNotes = (await readClip(moved.id!, ["notes"])).notes ?? "";

    expect(movedNotes).toContain("B3");
  });

  it("non-overlap duplicate still leaves two full clips (control)", async () => {
    // 4-bar clip at 25|1 ([25|1, 29|1]), duplicated to 30|1 — no overlap.
    const base = await dupToArr(midi4barId, "25|1");
    const copy = await dupToArr(base.id, "30|1");

    const clips = clipsInBarRange(await readArrClips(EMPTY_MIDI_TRACK), 25, 34);

    expect(clips).toHaveLength(2);
    expect(lengthBeats(clipAt(clips, "25|1"))).toBeCloseTo(beats("4bar"), 5);
    expect(lengthBeats(clipAt(clips, arrangementStartOf(copy)!))).toBeCloseTo(
      beats("4bar"),
      5,
    );
  });

  it("audio duplicate onto itself keeps a full-length copy with warp intact", async () => {
    // Place the sample in the arrangement, read its true length + warp state,
    // then duplicate it half its own length forward so it overlaps itself.
    const base = await dupToArr(audioId, "45|1");
    const baseClip = clipAt(
      clipsInBarRange(await readArrClips(AUDIO_TRACK), 44, 52),
      "45|1",
    );
    const baseLen = lengthBeats(baseClip);
    const baseWarping = (await readClip(base.id, ["warp"])).warping;

    const targetBeats = startToBeats("45|1") + baseLen / 2;

    await dupToArr(base.id, beatsToBarBeat(targetBeats));

    const clips = clipsInBarRange(await readArrClips(AUDIO_TRACK), 44, 52);

    // Two clips: the trimmed original at 45|1 and the full-length copy.
    expect(clips).toHaveLength(2);

    const placed = clips.find((c) => arrangementStartOf(c) !== "45|1");

    // The copy keeps the source's full arrangement length and warp state — the
    // holding round-trip did not truncate or unwarp the audio.
    expect(lengthBeats(placed)).toBeCloseTo(baseLen, 3);
    expect((await readClip(placed!.id!, ["warp"])).warping).toBe(baseWarping);
  });
});

/**
 * Duplicate a clip to an arrangement position.
 * @param id - Source clip ID
 * @param arrangementStart - Target position in bar|beat format
 * @returns The duplicated clip's metadata
 */
async function dupToArr(
  id: string,
  arrangementStart: string,
): Promise<ArrangementClipResult> {
  return duplicateClipToArrangement(ctx.client!, id, arrangementStart);
}

/**
 * Move an arrangement clip to a new position via update-clip.
 * @param id - Arrangement clip ID
 * @param arrangementStart - Target position in bar|beat format
 */
async function moveArrClip(
  id: string,
  arrangementStart: string,
): Promise<void> {
  await callTool(ctx.client!, "ppal-update-clip", {
    id: id,
    arrangementStart,
  });
  await sleep(100);
}

/**
 * Read all arrangement clips on a track.
 * @param trackIndex - Track index
 * @returns Array of arrangement clip data
 */
async function readArrClips(trackIndex: number): Promise<ReadClipResult[]> {
  return readArrangementClips(ctx.client!, trackIndex);
}

/**
 * Read a clip by id with the given include details.
 * @param clipId - Clip ID
 * @param include - read-clip include flags (e.g. ["notes"], ["warp"])
 * @returns The clip read result
 */
async function readClip(
  clipId: string,
  include: string[],
): Promise<ReadClipResult> {
  const result = await callTool(ctx.client!, "ppal-read-clip", {
    id: clipId,
    include,
  });

  return parseToolResult<ReadClipResult>(result);
}

/**
 * Parse a "bar|beat" position to absolute beats (4/4).
 * @param barBeat - Position in bar|beat format (e.g. "45|1")
 * @returns Position in Ableton beats
 */
function startToBeats(barBeat: string): number {
  const [bar, beat] = barBeat.split("|");

  return (Number.parseInt(bar!, 10) - 1) * 4 + (Number.parseFloat(beat!) - 1);
}

/**
 * Convert absolute beats to "bar|beat" (4/4).
 * @param totalBeats - Absolute beats
 * @returns Position in bar|beat format
 */
function beatsToBarBeat(totalBeats: number): string {
  const bar = Math.floor(totalBeats / 4) + 1;
  const beat = Math.round(((totalBeats % 4) + 1) * 100) / 100;

  return `${bar}|${beat}`;
}
