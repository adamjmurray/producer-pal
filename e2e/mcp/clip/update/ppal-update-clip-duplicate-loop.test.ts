// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for `update-clip` `duplicateLoop`, verified through the Live
 * round-trip. `duplicateLoop` calls Live's native Clip.duplicate_loop, which
 * doubles the loop and copies the existing notes (and automation envelopes) into
 * the new half. These tests exercise the native call against real Live - the
 * note doubling and the loop-length growth that the in-memory unit tests can't
 * observe (envelope copy isn't surfaced by read-clip, so it stays unit-only).
 *
 * They also pin the composition contract on real Live geometry: start/length are
 * refused alongside duplicateLoop and go in their own call first (ADR-0040);
 * firstStart composes, preTransforms edit the source, then the double, then
 * notes/transforms apply across the FULL doubled clip. The unit tests pin the
 * call ordering; these confirm the resulting notes land in the right bars.
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

  it("refuses length alongside duplicateLoop, leaving the clip untouched", async () => {
    // "double it to 4 bars" reads as length: "4bar" + duplicateLoop. It used to
    // land on 8 \u2014 length picks the region, then the double extends it \u2014 and the
    // note count doubles under either reading, so the wrong answer looked
    // exactly like the right one. Refused instead, before anything runs.
    const clipId = await createLoopingClip(1, "v100 C3 1|1 E3 2|1", "2bar");

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, duplicateLoop: true, length: "4bar" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      "duplicateLoop cannot be combined with length",
    );

    await sleep(100);

    // Nothing ran: still the 2-bar clip it started as.
    const clip = await readClip(clipId);

    expect(clip.length).toBe("2bar");
    expect(clip.notes).toContain("C3 1|1");
    expect(clip.notes).toContain("E3 2|1");
  });

  it("reports the length duplicateLoop landed on", async () => {
    // duplicate_loop moves the length on its own, and nothing else in the
    // result reveals it.
    const clipId = await createLoopingClip(6, "v100 C3 1|1 E3 2|1", "2bar");

    const { data, clip } = await duplicateLoopAndRead(clipId, {});

    expect(data.length).toBe("4bar");
    expect(clip.length).toBe("4bar");
  });

  it("doubles a sub-region selected by a prior call (insert pushes the rest out)", async () => {
    // The two-call workflow the refusal above points at, and the reason the
    // sub-region case is worth keeping: Live's duplicate_loop INSERTS the copy
    // at loop_end rather than overwriting, so material past the loop shifts
    // forward by the loop length.
    // 2-bar clip: C3 in bar 1, E3 in bar 2.
    const clipId = await createLoopingClip(4, "v100 C3 1|1 E3 2|1", "2bar");

    // Call 1: select ONLY bar 1 as the loop region; the bar-2 E3 falls outside.
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, length: "1bar" },
    });

    await sleep(100);

    // Call 2: double that 1-bar region to 2 bars.
    const { data, clip } = await duplicateLoopAndRead(clipId, {});

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

  it("composes firstStart, which does not select what gets copied", async () => {
    const clipId = await createLoopingClip(7, "v100 C3 1|1 E3 2|1", "2bar");

    // firstStart moves the playback marker, not the loop region. Probed in all
    // three orders against Live: same clip every time.
    const { data, clip } = await duplicateLoopAndRead(clipId, {
      firstStart: "2|1",
    });

    expect(data.noteCount).toBe(4);
    expect(clip.length).toBe("4bar");
    expect(clip.firstStart).toBe("2|1");
    expect(clip.notes).toContain("C3 3|1");
    expect(clip.notes).toContain("E3 4|1");
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
