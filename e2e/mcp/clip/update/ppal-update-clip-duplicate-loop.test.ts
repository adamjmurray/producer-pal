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
 * They also pin the composition contract on real Live geometry: preTransforms
 * edit the source BEFORE the double, then notes/transforms apply across the FULL
 * doubled clip. Only length is ignored (the double sets it). The unit tests pin
 * the call ordering; these confirm the resulting notes land in the right bars.
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

const ctx = setupMcpTestContext();

// t8 "9-MIDI" is empty in e2e-test-set.
const emptyMidiTrack = 8;

/** Create a 2-bar looping MIDI clip and return its id. */
async function createLoopingClip(
  sceneIndex: number,
  notes: string,
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      slot: `${emptyMidiTrack}/${sceneIndex}`,
      notes,
      length: "2bar",
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
    arguments: { clipId, include: ["notes", "timing"] },
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
    arguments: { ids: clipId, duplicateLoop: true, ...edits },
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
      arguments: { ids: clipId, duplicateLoop: true },
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

  it("ignores length passed alongside duplicateLoop (the double sets the length) and still doubles", async () => {
    const clipId = await createLoopingClip(1, "v100 C3 1|1 E3 2|1");

    // length conflicts with duplicateLoop: the double sets the new length, so the
    // length edit is dropped with a warning instead of resizing to 8 bars.
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clipId, duplicateLoop: true, length: "8bar" },
    });
    const { data, warnings } =
      parseToolResultWithWarnings<UpdateClipResult>(result);

    expect(data.noteCount).toBe(4);
    expect(warnings.join("\n")).toContain("duplicateLoop sets the clip length");

    await sleep(100);

    const clip = await readClip(clipId);

    // Doubled to 4 bars by the loop op, NOT resized to the ignored 8bar length.
    expect(clip.length).toBe("4bar");
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
      arguments: { ids: clipId, duplicateLoop: true, notes: "v100 G3 3|1" },
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
