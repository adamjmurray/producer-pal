// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the single-clip alternative to arrangementLength tiling.
 *
 * Both arrangementLength descriptions and docs/features/limitations.md tell
 * users that lengthening a looping arrangement clip tiles copies, and that
 * `looping: false` plus notes for the full length gets one long clip instead.
 * These tests hold both halves of that claim, including the transition case:
 * a clip that IS looping when the call arrives.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track)
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-arrangement-unloop-lengthening
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

describe("arrangementLength: tiling vs. the single-clip route", () => {
  it("tiles a looping clip into a row of copies (the default)", async () => {
    const id = await createLoopingArrClip("101|1");

    await lengthenTo4Bars({ id: id });

    const clips = clipsInBarRange(await readArrClips(), 101, 104);

    // A 1-bar loop stretched to 4 bars lands as 4 clips, not one.
    expect(clips).toHaveLength(4);
    expect(clips.map((c) => arrangementStartOf(c))).toStrictEqual([
      "101|1",
      "102|1",
      "103|1",
      "104|1",
    ]);
  });

  it("returns a single clip when looping is turned off in the same call", async () => {
    const id = await createLoopingArrClip("111|1");

    const { data, warnings } = await lengthenTo4Bars({
      id: id,
      looping: false,
      notes: FOUR_BARS_OF_NOTES,
    });

    // The documented route is a clean one — nothing to report anywhere, same
    // clip back, and the notes confirmed by count so the caller needn't
    // re-read the clip.
    expect(warnings).toStrictEqual([]);
    expect(data.detail).toBeUndefined();
    expect(data.id).toBe(id);
    expect(data.noteCount).toBe(4);

    const clips = clipsInBarRange(await readArrClips(), 111, 114);

    expect(clips).toHaveLength(1);
    await expectFourBarClipAt(clips[0]!, "111|1");
  });

  it("keeps the source clip's tiling behavior after a duplicate hand-off", async () => {
    const sourceId = await createLoopingArrClip("121|1");
    const { id: copyId } = await duplicateClipToArrangement(
      ctx.client!,
      sourceId,
      "131|1",
    );

    // ppal-duplicate has no looping param, so its description points here.
    const { data, warnings } = await lengthenTo4Bars({
      id: copyId,
      looping: false,
      notes: FOUR_BARS_OF_NOTES,
    });

    expect(warnings).toStrictEqual([]);
    expect(data.id).toBe(copyId);
    expect(data.noteCount).toBe(4);

    const copies = clipsInBarRange(await readArrClips(), 131, 134);

    expect(copies).toHaveLength(1);
    await expectFourBarClipAt(copies[0]!, "131|1");

    // The source is untouched — still a 1-bar loop.
    const source = clipsInBarRange(await readArrClips(), 121, 124);

    expect(source).toHaveLength(1);
    expect(source[0]!.id).toBe(sourceId);
    expect(lengthBeats(source[0]!)).toBeCloseTo(beats("1bar"), 5);
  });

  // Growing into the lane destroys whatever is standing there, and Live says
  // nothing about it — so the clip that grew has to.
  it("says on the clip's entry what the tiles ran over", async () => {
    const id = await createLoopingArrClip("161|1");
    const buried = await createLoopingArrClip("163|1");
    const { data, warnings } = await tileClip(id, "4bar");

    // The clip the call named is the first entry; the rest are its tiles.
    expect(data[0]?.id).toBe(id);
    expect(data[0]?.detail).toBe(
      `overwrote the clip at t${EMPTY_MIDI_TRACK}[163|1]`,
    );
    expect(warnings).toStrictEqual([]);

    // The row really did replace it: four clips, and none of them the old one.
    const clips = clipsInBarRange(await readArrClips(), 161, 164);

    expect(clips).toHaveLength(4);
    expect(clips.map((clip) => clip.id)).not.toContain(buried);
  });

  // A copy that starts mid-loop doesn't play a note that began before it, and
  // the clip before it ends the note at the boundary.
  it("says on the clip's entry when a tile boundary cuts a note short", async () => {
    const created = await callTool(ctx.client!, "ppal-create-clip", {
      path: `t${EMPTY_MIDI_TRACK}[171|1]`,
      notes: "n1/1 C3 1|3",
      length: "2bar",
      looping: true,
    });
    const id = parseToolResult<{ id: string }>(created).id;

    await sleep(200);
    await callTool(ctx.client!, "ppal-update-clip", {
      id,
      arrangementLength: "1bar",
    });
    await sleep(200);

    const { data, warnings } = await tileClip(id, "4bar");

    // Counted once, though the note crosses the boundaries at 172|1 and 174|1.
    expect(data[0]?.id).toBe(id);
    expect(data[0]?.detail).toBe("1 note crossed a cut and now ends at it");
    expect(warnings).toStrictEqual([]);
    expect(clipsInBarRange(await readArrClips(), 171, 174)).toHaveLength(4);
  });

  // A clip that spans more than its loop is cut back to one pass before it is
  // tiled, and with the start marker inside the loop the tiles restart at the
  // loop start rather than carrying on from where the clip stops.
  it("counts from where each piece stops when the tiles restart at the loop start", async () => {
    // A 4-bar session clip with a note from beat 6 to 10, looped over bars 2-4
    // with a 1-bar pre-roll: a plain arrangement copy spans 4 bars of a 3-bar loop.
    const session = parseToolResult<{ id: string }>(
      await callTool(ctx.client!, "ppal-create-clip", {
        path: `t${EMPTY_MIDI_TRACK}/s5`,
        notes: "n1/1 C3 2|3",
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

    const copy = parseToolResult<{ id: string }>(
      await callTool(ctx.client!, "ppal-duplicate", {
        type: "clip",
        id: session.id,
        toPath: `t${EMPTY_MIDI_TRACK}[351|1]`,
      }),
    );

    await sleep(200);

    // Move the start marker into the loop (beat 8 of a loop over beats 4-16).
    await callTool(ctx.client!, "ppal-update-clip", {
      id: copy.id,
      firstStart: "3|1",
    });
    await sleep(200);

    // The setup only means something if the clip still spans more than a pass.
    const before = clipsInBarRange(await readArrClips(), 351, 360);

    expect(before).toHaveLength(1);
    expect(before[0]!.firstStart).toBe("3|1");
    expect(lengthBeats(before[0])).toBeGreaterThan(beats("3bar"));

    const { data, warnings } = await tileClip(copy.id, "10bar");
    const clips = clipsInBarRange(await readArrClips(), 351, 360);

    // The first piece plays from beat 8 to the loop end, then 4 to 8, and stops
    // at beat 8 with the note sounding. The tiles play from the loop start
    // (2|1) to the loop end, where Live ends the note itself. A clip that plays
    // from its loop start reads with no firstStart.
    expect(clips[0]!.firstStart).toBe("3|1");
    expect(clips.slice(1).map((clip) => clip.firstStart)).toStrictEqual(
      clips.slice(1).map(() => undefined),
    );
    expect(data[0]?.id).toBe(copy.id);
    expect(data[0]?.detail).toBe("1 note crossed a cut and now ends at it");
    expect(warnings).toStrictEqual([]);
  });

  it("says nothing when no note crosses a tile boundary", async () => {
    const id = await createLoopingArrClip("181|1");
    const { data } = await tileClip(id, "4bar");

    expect(data[0]?.detail).toBeUndefined();
  });

  it("tiles when ppal-duplicate itself does the lengthening", async () => {
    const sourceId = await createLoopingArrClip("141|1");

    await callTool(ctx.client!, "ppal-duplicate", {
      type: "clip",
      id: sourceId,
      toPath: "[151|1]",
      arrangementLength: "4bar",
    });
    await sleep(200);

    const copies = clipsInBarRange(await readArrClips(), 151, 154);

    expect(copies).toHaveLength(4);
  });
});

/**
 * Create a 1-bar looping arrangement clip on the empty MIDI track.
 * @param position - Position in bar|beat format
 * @returns The new clip's ID
 */
async function createLoopingArrClip(position: string): Promise<string> {
  const result = await callTool(ctx.client!, "ppal-create-clip", {
    path: `t${EMPTY_MIDI_TRACK}[${position}]`,
    notes: "C3 1|1",
    length: "1bar",
    looping: true,
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
 * Lengthen an arrangement clip to 4 bars, keeping any warnings.
 * @param args - update-clip arguments beyond arrangementLength
 * @returns The single updated clip and any warnings
 */
async function lengthenTo4Bars(
  args: Record<string, unknown>,
): Promise<{ data: LengthenedClip; warnings: string[] }> {
  const result = await callTool(ctx.client!, "ppal-update-clip", {
    ...args,
    arrangementLength: "4bar",
  });

  await sleep(200);

  return parseToolResultWithWarnings<LengthenedClip>(result);
}

/**
 * Lengthen a looping arrangement clip by tiling it, keeping any warnings.
 * @param id - The clip to lengthen
 * @param arrangementLength - Target length, e.g. "4bar"
 * @returns The named clip followed by its tiles, and any warnings
 */
async function tileClip(
  id: string,
  arrangementLength: string,
): Promise<{ data: LengthenedClip[]; warnings: string[] }> {
  const result = await callTool(ctx.client!, "ppal-update-clip", {
    id,
    arrangementLength,
  });

  await sleep(200);

  return parseToolResultWithWarnings<LengthenedClip[]>(result);
}

/**
 * Read all arrangement clips on the empty MIDI track.
 * @returns Array of arrangement clip data
 */
async function readArrClips(): Promise<ReadClipResult[]> {
  return readArrangementClips(ctx.client!, EMPTY_MIDI_TRACK);
}

/**
 * Assert a clip is the unlooped 4-bar result: right position, loop off, a
 * content region covering all four bars, and a note in each of them.
 * @param clip - The clip read back from the track
 * @param position - Expected position in bar|beat format
 */
async function expectFourBarClipAt(
  clip: ReadClipResult,
  position: string,
): Promise<void> {
  expect(arrangementStartOf(clip)).toBe(position);
  expect(lengthBeats(clip)).toBeCloseTo(beats("4bar"), 5);
  expect(clip.looping).toBe(false);

  const read = parseToolResult<ReadClipResult>(
    await callTool(ctx.client!, "ppal-read-clip", {
      id: clip.id,
      include: ["notes", "timing"],
    }),
  );

  // The clip's own region grew too — not just the arrangement view of it.
  expect(read.start).toBe("1|1");
  expect(read.end).toBe("5|1");

  // A note in every bar, so the pattern really spans the span.
  for (const note of ["C3 1|1", "D3 2|1", "E3 3|1", "F3 4|1"]) {
    expect(read.notes).toContain(note);
  }
}
