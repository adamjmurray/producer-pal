// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for `update-clip` `duplicateLoop`, verified through the Live
 * round-trip. `duplicateLoop` calls Live's native Clip.duplicate_loop, which
 * doubles the loop and copies the existing notes (and automation envelopes) into
 * the new half. These tests exercise the native call against real Live — the
 * note doubling and the loop-length growth that the in-memory unit tests can't
 * observe (envelope copy isn't surfaced by read-clip, so it stays unit-only).
 *
 * They also pin the composition contract on real Live geometry: start/length/
 * firstStart select the loop region first, preTransforms edit the source, then
 * the double, then notes/transforms apply across the FULL doubled clip. The unit
 * tests pin the call ordering; these confirm the resulting notes land in the
 * right bars.
 *
 * Uses: e2e-test-set - t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-duplicate-loop
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** Create a looping MIDI clip (default 2 bars) and return its id. */
async function createLoopingClip(
  sceneIndex: number,
  notes: string,
  length = "2bar",
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      path: `t${EMPTY_MIDI_TRACK}/s${sceneIndex}`,
      notes,
      length,
      looping: true,
    },
  });
  const { data } = parseToolResultWithWarnings<{ id: string }>(result);

  await sleep(100);

  return data.id;
}

/** Read a clip's notes + timing back from Live. */
async function readClip(clipId: string): Promise<ReadClipResult> {
  await sleep(50);

  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { id: clipId, include: ["notes", "timing"] },
  });

  return parseToolResultWithWarnings<ReadClipResult>(result).data;
}

/**
 * Run a duplicateLoop update with extra edits, then read the doubled clip back.
 * Returns the parsed update result, its warnings, and the round-tripped clip.
 */
async function duplicateLoopAndRead(
  clipId: string,
  edits: Record<string, unknown>,
): Promise<{
  data: UpdateClipResult;
  warnings: string[];
  clip: ReadClipResult;
}> {
  const result = await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { id: clipId, duplicateLoop: true, ...edits },
  });
  const { data, warnings } =
    parseToolResultWithWarnings<UpdateClipResult>(result);

  await sleep(100);

  const clip = await readClip(clipId);

  return { data, warnings, clip };
}

/**
 * Assert a doubled clip transposed up an octave: the originals (C3) are gone,
 * the octave-up pitches are present, and copies landed in the new bars 3-4.
 */
function expectOctaveUpDoubledClip(clip: ReadClipResult): void {
  expect(clip.length).toBe("4bar");
  expect(clip.notes).toContain("C4");
  expect(clip.notes).toContain("E4");
  expect(clip.notes).not.toContain("C3");
  expect(clip.notes).toContain("3|1");
  expect(clip.notes).toContain("4|1");
}

describe("ppal-update-clip duplicateLoop", () => {
  it("doubles a looping MIDI clip: copies notes into the new half and doubles the length", async () => {
    // One note per bar in a 2-bar loop.
    const clipId = await createLoopingClip(0, "v100 C3 1|1 E3 2|1");

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, duplicateLoop: true },
    });
    const { data } = parseToolResultWithWarnings<UpdateClipResult>(result);

    // 2 notes -> 4 after the loop is doubled.
    expect(data.noteCount).toBe(4);

    await sleep(100);

    const clip = await readClip(clipId);

    // The 2-bar loop is now 4 bars...
    expect(clip.length).toBe("4bar");
    // ...originals in bars 1-2 preserved, copies in the new bars 3-4.
    expect(clip.notes).toContain("1|1");
    expect(clip.notes).toContain("2|1");
    expect(clip.notes).toContain("3|1");
    expect(clip.notes).toContain("4|1");
    expect(clip.notes).toContain("C3");
    expect(clip.notes).toContain("E3");
  });

  it("applies length to select the loop region BEFORE doubling (composes instead of ignoring length)", async () => {
    // 1-bar looping clip with a single note in bar 1.
    const clipId = await createLoopingClip(1, "v100 C3 1|1", "1bar");

    // length selects a 2-bar loop region first (growing into the empty bar 2),
    // THEN the native double extends that selection to 4 bars - the two compose.
    // Previously length was dropped with a warning and the 1-bar loop just
    // doubled to 2 bars; now there is no warning and the selection is honored.
    const { data, warnings, clip } = await duplicateLoopAndRead(clipId, {
      length: "2bar",
    });

    // bar 1 C3 + its copy one loop-length (2 bars) later = 2 notes.
    expect(data.noteCount).toBe(2);
    expect(warnings.join("\n")).not.toContain(
      "duplicateLoop sets the clip length",
    );

    // Selected 2-bar region doubled to 4 bars (NOT the old 2-bar result the
    // ignored-length path produced).
    expect(clip.length).toBe("4bar");
    // Original note in bar 1, its copy in bar 3 (one 2-bar loop later).
    expect(clip.notes).toContain("C3");
    expect(clip.notes).toContain("1|1");
    expect(clip.notes).toContain("3|1");
  });

  it("selects a sub-region smaller than the content, then doubles it (insert pushes the rest out)", async () => {
    // 2-bar clip: C3 in bar 1, E3 in bar 2.
    const clipId = await createLoopingClip(4, "v100 C3 1|1 E3 2|1", "2bar");

    // length selects ONLY bar 1 (loop region [0, 1bar]); the bar-2 E3 falls
    // outside the loop. Then duplicate_loop doubles that 1-bar region to 2 bars.
    // Live's duplicate_loop INSERTS the copy at loop_end (it does not overwrite),
    // so material after the loop is shifted forward by the loop length.
    const { data, warnings, clip } = await duplicateLoopAndRead(clipId, {
      length: "1bar",
    });

    expect(warnings.join("\n")).not.toContain(
      "duplicateLoop sets the clip length",
    );
    // 3 notes: the in-region C3, its inserted copy, and the pushed-out E3.
    expect(data.noteCount).toBe(3);
    // The selected 1-bar region doubled to a 2-bar loop.
    expect(clip.length).toBe("2bar");
    // Bar 1 C3 (original) + bar 2 C3 (the inserted copy of the 1-bar region).
    expect(clip.notes).toContain("C3 1|1");
    expect(clip.notes).toContain("C3 2|1");
    // The original bar-2 E3 was pushed forward one loop-length to bar 3, landing
    // beyond the new 2-bar loop (overhang, read but not played by the loop).
    expect(clip.notes).toContain("E3 3|1");
  });

  it("applies preTransforms to the source BEFORE doubling", async () => {
    const clipId = await createLoopingClip(2, "v100 C3 1|1 E3 2|1");

    // preTransforms transposes the source up an octave first, so the native copy
    // carries the transposed notes into the new half: all four end up an octave up.
    const { data, clip } = await duplicateLoopAndRead(clipId, {
      preTransforms: "pitch += 12",
    });

    expect(data.noteCount).toBe(4);
    // Every note an octave up across all four bars; originals (C3/E3) are gone.
    expectOctaveUpDoubledClip(clip);
  });

  it("merges notes into the doubled clip AFTER the double", async () => {
    const clipId = await createLoopingClip(3, "v100 C3 1|1 E3 2|1");

    // The new note targets bar 3, which only exists after the double. It merges
    // into the new half alongside the copied C3 there.
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, duplicateLoop: true, notes: "v100 G3 3|1" },
    });
    const { data } = parseToolResultWithWarnings<UpdateClipResult>(result);

    // 4 doubled notes + 1 merged G3 (no pitch+start collision) = 5.
    expect(data.noteCount).toBe(5);

    await sleep(100);

    const clip = await readClip(clipId);

    expect(clip.length).toBe("4bar");
    expect(clip.notes).toContain("G3");
    expect(clip.notes).toContain("3|1");
    expect(clip.notes).toContain("4|1");
  });

  it("applies transforms across the FULL doubled clip AFTER the double", async () => {
    const clipId = await createLoopingClip(5, "v100 C3 1|1 E3 2|1");

    // The clip is doubled first, then the transform hits all four notes (both the
    // originals and the copies in the new half).
    const { data, clip } = await duplicateLoopAndRead(clipId, {
      transforms: "pitch += 12",
    });

    expect(data.noteCount).toBe(4);
    // All four (incl. the copies in bars 3-4) transposed up an octave.
    expectOctaveUpDoubledClip(clip);
  });
});
