// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

    // The documented route is a clean one — no warnings, same clip back, and
    // the notes confirmed by count so the caller needn't re-read the clip.
    expect(warnings).toStrictEqual([]);
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
