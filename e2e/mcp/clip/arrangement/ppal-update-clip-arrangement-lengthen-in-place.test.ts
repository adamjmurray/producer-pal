// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for arrangementLength resizing one clip in place.
 *
 * A looping clip stays one looping clip: same id, same loop region, its span
 * stretched to the target. `looping: false` in the same call gives one unlooped
 * clip instead. Whatever the clip grows over is overwritten, and its entry says
 * so.
 *
 * A take-lane clip resizes too, but can't clear its lane, so it stops at the next
 * clip there.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track)
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-arrangement-lengthen-in-place
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  beats,
  callTool,
  clipsInBarRange,
  duplicateClipToArrangement,
  lengthBeats,
  readArrangementClips,
} from "../helpers/arrangement-clip-query-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import { arrangementStartOf } from "../helpers/arrangement-start-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

/** Four bars of notes, one per bar — proves the pattern spans the whole span. */
const FOUR_BARS_OF_NOTES = "C3 1|1 D3 2|1 E3 3|1 F3 4|1";

describe("arrangementLength: one clip, resized in place", () => {
  it("keeps a looping clip as one looping clip", async () => {
    const id = await createArrClip("101|1");
    const { data, warnings } = await lengthen({ id });

    expect(warnings).toStrictEqual([]);
    expect(data).toStrictEqual(expect.objectContaining({ id }));
    expect(data.detail).toBeUndefined();

    const clips = clipsInBarRange(await readArrClips(), 101, 104);

    expect(clips).toHaveLength(1);
    await expectLoopedFourBarClipAt(clips[0]!, id, "101|1");
  });

  it("returns a single unlooped clip when looping is turned off in the same call", async () => {
    const id = await createArrClip("111|1");

    const { data, warnings } = await lengthen({
      id: id,
      looping: false,
      notes: FOUR_BARS_OF_NOTES,
    });

    // Same clip back, and the notes confirmed by count so the caller needn't
    // re-read the clip.
    expect(warnings).toStrictEqual([]);
    expect(data.detail).toBeUndefined();
    expect(data.id).toBe(id);
    expect(data.noteCount).toBe(4);

    const clips = clipsInBarRange(await readArrClips(), 111, 114);

    expect(clips).toHaveLength(1);
    await expectUnloopedFourBarClipAt(clips[0]!, "111|1");
  });

  it("unloops a duplicated clip in a follow-up call", async () => {
    const sourceId = await createArrClip("121|1");
    const { id: copyId } = await duplicateClipToArrangement(
      ctx.client!,
      sourceId,
      "131|1",
    );

    // ppal-duplicate has no looping param, so its description points here.
    const { data, warnings } = await lengthen({
      id: copyId,
      looping: false,
      notes: FOUR_BARS_OF_NOTES,
    });

    expect(warnings).toStrictEqual([]);
    expect(data.id).toBe(copyId);
    expect(data.noteCount).toBe(4);

    const copies = clipsInBarRange(await readArrClips(), 131, 134);

    expect(copies).toHaveLength(1);
    await expectUnloopedFourBarClipAt(copies[0]!, "131|1");

    // The source is untouched — still a 1-bar loop.
    const source = clipsInBarRange(await readArrClips(), 121, 124);

    expect(source).toHaveLength(1);
    expect(source[0]!.id).toBe(sourceId);
    expect(lengthBeats(source[0]!)).toBeCloseTo(beats("1bar"), 5);
  });

  it("gives one looping clip when ppal-duplicate itself does the lengthening", async () => {
    const sourceId = await createArrClip("141|1");

    await callTool(ctx.client!, "ppal-duplicate", {
      type: "clip",
      id: sourceId,
      toPath: "[151|1]",
      arrangementLength: "4bar",
    });
    await sleep(200);

    const copies = clipsInBarRange(await readArrClips(), 151, 154);

    expect(copies).toHaveLength(1);
    expect(copies[0]!.id).not.toBe(sourceId);
    await expectLoopedFourBarClipAt(copies[0]!, copies[0]!.id!, "151|1");
  });

  // Growing into the lane destroys whatever is standing there, and Live says
  // nothing about it — so the clip that grew has to.
  it("overwrites a clip a looping clip grows over, and says so", async () => {
    const id = await createArrClip("161|1");
    const buried = await createArrClip("163|1");
    const { data, warnings } = await lengthen({ id });

    expect(data.id).toBe(id);
    expect(data.detail).toBe(
      `overwrote the clip at t${EMPTY_MIDI_TRACK}[163|1]`,
    );
    expect(warnings).toStrictEqual([]);

    const clips = clipsInBarRange(await readArrClips(), 161, 164);

    expect(clips.map((clip) => clip.id)).not.toContain(buried);
    expect(clips).toHaveLength(1);
    await expectLoopedFourBarClipAt(clips[0]!, id, "161|1");
  });

  // An unlooped clip used to stop short at the next clip.
  it("shortens a clip an unlooped clip grows into, and lands at full length", async () => {
    const id = await createArrClip("191|1", { looping: false });

    // Bars 194-195: the lengthened clip ends at 195|1, so only the front goes.
    await createArrClip("194|1", { length: "2bar" });

    const { data, warnings } = await lengthen({ id });

    expect(data.id).toBe(id);
    expect(data.detail).toBe(
      `shortened the clip at t${EMPTY_MIDI_TRACK}[195|1]`,
    );
    expect(warnings).toStrictEqual([]);

    const clips = clipsInBarRange(await readArrClips(), 191, 195);

    expect(clips.map((clip) => arrangementStartOf(clip))).toStrictEqual([
      "191|1",
      "195|1",
    ]);
    expect(clips[0]!.id).toBe(id);
    expect(clips[0]!.looping).toBe(false);
    expect(lengthBeats(clips[0])).toBeCloseTo(beats("4bar"), 5);
    expect(lengthBeats(clips[1])).toBeCloseTo(beats("1bar"), 5);
  });

  it("keeps a start marker inside the loop where it is", async () => {
    const copy = await copyPreRollClipTo(5, "351|1");

    await sleep(200);

    // Move the start marker into the loop (beat 8 of a loop over beats 4-16).
    await callTool(ctx.client!, "ppal-update-clip", {
      id: copy.id,
      firstStart: "3|1",
    });
    await sleep(200);

    const { data, warnings } = await lengthen({ id: copy.id }, "10bar");

    expect(warnings).toStrictEqual([]);
    expect(data.id).toBe(copy.id);
    expect(data.detail).toBeUndefined();

    const clips = clipsInBarRange(await readArrClips(), 351, 360);

    expect(clips).toHaveLength(1);
    expect(clips[0]).toStrictEqual(
      expect.objectContaining({
        id: copy.id,
        looping: true,
        start: "2|1",
        end: "5|1",
        firstStart: "3|1",
      }),
    );
    expect(lengthBeats(clips[0])).toBeCloseTo(beats("10bar"), 5);
  });

  // Cut inside the pre-roll, the clip ends before its loop begins.
  it("shortens a clip to less than its pre-roll, and grows it back", async () => {
    const copy = await copyPreRollClipTo(6, "371|1");

    await sleep(200);

    const cut = await lengthen({ id: copy.id }, "n/2");

    expect(cut.warnings).toStrictEqual([]);
    expect(cut.data.id).toBe(copy.id);
    await expectPreRollClipAt(copy.id, 371, "n/2");

    const grown = await lengthen({ id: copy.id }, "8bar");

    expect(grown.warnings).toStrictEqual([]);
    expect(grown.data.id).toBe(copy.id);
    await expectPreRollClipAt(copy.id, 371, "8bar");
  });
});

// A take lane can't be cleared, so a lengthen there stops at the next clip.
describe("arrangementLength on a take-lane clip", () => {
  it("resizes it in place, stopping at the next clip on the lane", async () => {
    const first = await createLaneClip("201|1");

    await createLaneClip("205|1");

    const grown = parseToolResultWithWarnings<{ id: string; detail?: string }>(
      await callTool(ctx.client!, "ppal-update-clip", {
        id: first,
        arrangementLength: "8bar",
      }),
    );

    expect(grown.data.id).toBe(first);
    expect(grown.data.detail).toBe(
      "arrangementLength landed at 4bar: the next clip on the lane starts there",
    );
    expect(await laneClipLengths()).toStrictEqual(["4bar", "1bar"]);

    await callTool(ctx.client!, "ppal-update-clip", {
      id: first,
      arrangementLength: "2bar",
    });

    expect(await laneClipLengths()).toStrictEqual(["2bar", "1bar"]);
  });
});

/**
 * Copy a session clip to the arrangement: 4 bars, looped over bars 2-4 with a
 * 1-bar pre-roll, so the copy spans 4 bars of a 3-bar loop.
 * @param slot - The session slot to build the clip in
 * @param position - Where the copy lands, in bar|beat format
 * @returns The arrangement copy
 */
async function copyPreRollClipTo(
  slot: number,
  position: string,
): Promise<{ id: string }> {
  const session = parseToolResult<{ id: string }>(
    await callTool(ctx.client!, "ppal-create-clip", {
      path: `t${EMPTY_MIDI_TRACK}/s${slot}`,
      notes: "C3 2|1",
      length: "4bar",
      looping: true,
    }),
  );

  await sleep(200);
  await callTool(ctx.client!, "ppal-update-clip", {
    id: session.id,
    start: "2|1",
    length: "3bar",
    firstStart: "1|1",
  });
  await sleep(200);

  return parseToolResult<{ id: string }>(
    await callTool(ctx.client!, "ppal-duplicate", {
      type: "clip",
      id: session.id,
      toPath: `t${EMPTY_MIDI_TRACK}[${position}]`,
    }),
  );
}

/**
 * Assert the pre-roll clip is still the one clip at its bar, at the given
 * length, with its loop and start marker where they were.
 * @param id - The clip it must be
 * @param bar - The bar it starts at
 * @param length - Its expected arrangement length
 */
async function expectPreRollClipAt(
  id: string,
  bar: number,
  length: string,
): Promise<void> {
  const clips = clipsInBarRange(await readArrClips(), bar, bar + 9);

  expect(clips).toHaveLength(1);
  expect(clips[0]).toStrictEqual(
    expect.objectContaining({
      id,
      looping: true,
      start: "2|1",
      end: "5|1",
      firstStart: "1|1",
    }),
  );
  expect(lengthBeats(clips[0])).toBeCloseTo(beats(length), 5);
}

/**
 * Create a 1-bar MIDI clip on the empty track's first take lane.
 * @param position - Where it starts, in bar|beat format
 * @returns The clip's id
 */
async function createLaneClip(position: string): Promise<string> {
  const { data } = parseToolResultWithWarnings<{ id: string }>(
    await callTool(ctx.client!, "ppal-create-clip", {
      path: `t${EMPTY_MIDI_TRACK}/l0[${position}]`,
      notes: "C3 1|1",
      length: "1bar",
    }),
  );

  await sleep(100);

  return data.id;
}

/**
 * @returns The arrangement length of each clip on the empty track's first
 *   take lane, in lane order
 */
async function laneClipLengths(): Promise<string[]> {
  await sleep(100);

  const track = parseToolResult<{
    takeLanes?: Array<{ clips: Array<{ arrangementLength?: string }> }>;
  }>(
    await callTool(ctx.client!, "ppal-read-track", {
      path: `t${EMPTY_MIDI_TRACK}`,
      include: ["arrangement-clips"],
    }),
  );

  return (track.takeLanes?.[0]?.clips ?? []).map(
    (clip) => clip.arrangementLength ?? "",
  );
}

/**
 * Create a 1-bar-pattern arrangement clip on the empty MIDI track.
 * @param position - Position in bar|beat format
 * @param options - Clip options
 * @param options.looping - Whether the clip loops (default true)
 * @param options.length - Clip length (default "1bar")
 * @returns The new clip's ID
 */
async function createArrClip(
  position: string,
  { looping = true, length = "1bar" } = {},
): Promise<string> {
  const result = await callTool(ctx.client!, "ppal-create-clip", {
    path: `t${EMPTY_MIDI_TRACK}[${position}]`,
    notes: "C3 1|1",
    length,
    looping,
  });

  await sleep(200);

  return parseToolResult<{ id: string }>(result).id;
}

interface LengthenedClip {
  id: string;
  noteCount?: number;
  /** What the lengthening had to say about this clip. */
  detail?: string;
}

/**
 * Lengthen an arrangement clip, keeping any warnings.
 * @param args - update-clip arguments beyond arrangementLength
 * @param arrangementLength - Target length (default "4bar")
 * @returns The single updated clip and any warnings
 */
async function lengthen(
  args: Record<string, unknown>,
  arrangementLength = "4bar",
): Promise<{ data: LengthenedClip; warnings: string[] }> {
  const result = await callTool(ctx.client!, "ppal-update-clip", {
    ...args,
    arrangementLength,
  });

  await sleep(200);

  return parseToolResultWithWarnings<LengthenedClip>(result);
}

/**
 * Read all arrangement clips on the empty MIDI track.
 * @returns Array of arrangement clip data
 */
async function readArrClips(): Promise<ReadClipResult[]> {
  return readArrangementClips(ctx.client!, EMPTY_MIDI_TRACK);
}

/**
 * Read a clip's notes and timing.
 * @param id - The clip
 * @returns The clip read back
 */
async function readClip(id: string | null): Promise<ReadClipResult> {
  return parseToolResult<ReadClipResult>(
    await callTool(ctx.client!, "ppal-read-clip", {
      id,
      include: ["notes", "timing"],
    }),
  );
}

/**
 * Assert a clip is the looped 4-bar result: the given clip, right position,
 * still looping over its original 1-bar loop, its note kept.
 * @param clip - The clip read back from the track
 * @param id - The clip it must be
 * @param position - Expected position in bar|beat format
 */
async function expectLoopedFourBarClipAt(
  clip: ReadClipResult,
  id: string,
  position: string,
): Promise<void> {
  expect(clip.id).toBe(id);
  expect(arrangementStartOf(clip)).toBe(position);
  expect(lengthBeats(clip)).toBeCloseTo(beats("4bar"), 5);

  const read = await readClip(clip.id);

  expect(read.looping).toBe(true);
  expect(read.start).toBe("1|1");
  expect(read.end).toBe("2|1");
  expect(read.notes).toContain("C3 1|1");
}

/**
 * Assert a clip is the unlooped 4-bar result: right position, loop off, a
 * content region covering all four bars, and a note in each of them.
 * @param clip - The clip read back from the track
 * @param position - Expected position in bar|beat format
 */
async function expectUnloopedFourBarClipAt(
  clip: ReadClipResult,
  position: string,
): Promise<void> {
  expect(arrangementStartOf(clip)).toBe(position);
  expect(lengthBeats(clip)).toBeCloseTo(beats("4bar"), 5);
  expect(clip.looping).toBe(false);

  const read = await readClip(clip.id);

  // The clip's own region grew too — not just the arrangement view of it.
  expect(read.start).toBe("1|1");
  expect(read.end).toBe("5|1");

  // A note in every bar, so the pattern really spans the span.
  for (const note of ["C3 1|1", "D3 2|1", "E3 3|1", "F3 4|1"]) {
    expect(read.notes).toContain(note);
  }
}
