// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-clip preTransforms (v1.4.11).
 *
 * preTransforms runs on EXISTING notes BEFORE any new `notes` are merged. It
 * clears or edits notes already in the clip — with or without a `notes` arg.
 * Covers the gaps beyond the clear-all+write path already exercised in
 * ppal-update-clip.test.ts: bare clear/edit (no notes), region-scoped clear,
 * drum-lane remap, and pre-merge ordering. The shorthand forms used here
 * (`v0`, `1|1-1|4: v0`, `C1: C4`) are exactly the small-model-mode subset.
 * Also checks that a malformed transform's error reaches the model with its fix,
 * and that a region change with a note edit reports the notes left outside it.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-pretransforms
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
  type UpdateClipResult,
} from "../../../mcp-test-helpers.ts";
import { createClipTransformHelpers } from "../../helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();
const { createMidiClip, readClipNotes } = createClipTransformHelpers(ctx);

/**
 * Apply an update-clip call and assert the note count it reports back. Every
 * test here turns on that count: it is read back from the clip, so it says
 * whether preTransforms edited in place or merged a copy.
 * @param clipId - Clip to update
 * @param args - update-clip arguments beyond the clip id
 * @param noteCount - Expected note count after the update
 */
async function expectUpdatedNoteCount(
  clipId: string,
  args: Record<string, unknown>,
  noteCount: number,
): Promise<void> {
  const updated = parseToolResult<UpdateClipResult>(
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, ...args },
    }),
  );

  await sleep(100);

  expect(updated.noteCount).toBe(noteCount);
}

/**
 * Apply an update-clip call and return the entry's `detail` line.
 * @param args - update-clip arguments, including the clip id
 * @returns The result's detail, if any
 */
async function updateClipDetail(
  args: Record<string, unknown>,
): Promise<string | undefined> {
  const updated = parseToolResult<UpdateClipResult & { detail?: string }>(
    await ctx.client!.callTool({ name: "ppal-update-clip", arguments: args }),
  );

  await sleep(100);

  return updated.detail;
}

describe("ppal-update-clip preTransforms", () => {
  it("clears all existing notes with a bare preTransforms (no notes arg)", async () => {
    const clipId = await createMidiClip(0, "C3 D3 E3 1|1");

    await expectUpdatedNoteCount(clipId, { preTransforms: "v0" }, 0);

    expect(await readClipNotes(clipId)).toBe("");
  });

  it("edits existing notes in place with a bare preTransforms (no merge)", async () => {
    const clipId = await createMidiClip(0, "v100 C3 D3 E3 1|1");

    // Bare edit: set velocity on every existing note. Note count must stay 3 —
    // this proves preTransforms edits in place rather than merging a copy.
    await expectUpdatedNoteCount(clipId, { preTransforms: "v50" }, 3);

    const notes = await readClipNotes(clipId);

    expect(notes).toContain("v50");
    expect(notes).toContain("C3");
    expect(notes).toContain("D3");
    expect(notes).toContain("E3");
  });

  it("clears a region before merging, preserving notes outside the region", async () => {
    // Bar 1 (beats 1-4) + bar 2 (beats 2-3). Length 2bar covers both.
    const clipId = await createMidiClip(
      0,
      "C3 1|1\nD3 1|2\nE3 1|3\nF3 1|4\nG3 2|2\nA3 2|3",
    );

    // Clear all of bar 1, then merge a single new note into it. Bar 2 untouched.
    // 1 merged (C4) + 2 preserved (G3, A3)
    await expectUpdatedNoteCount(
      clipId,
      { preTransforms: "1|1-1|4: v0", notes: "C4 1|1" },
      3,
    );

    const notes = await readClipNotes(clipId);

    expect(notes).toContain("C4"); // merged into the cleared region
    expect(notes).toContain("G3"); // preserved (bar 2)
    expect(notes).toContain("A3"); // preserved (bar 2)
    expect(notes).not.toContain("C3"); // cleared by preTransforms
    expect(notes).not.toContain("D3");
    expect(notes).not.toContain("E3");
    expect(notes).not.toContain("F3");
  });

  it("remaps a drum lane with preTransforms (C1: C4)", async () => {
    const clipId = await createMidiClip(0, "C1 1|1 1|2 1|3 1|4");

    // Remap moves pitch in place; the 4 notes stay 4 notes.
    await expectUpdatedNoteCount(clipId, { preTransforms: "C1: C4" }, 4);

    const notes = await readClipNotes(clipId);

    expect(notes).toContain("C4");
    expect(notes).not.toContain("C1");
  });
});

describe("ppal-update-clip notes outside the region", () => {
  // Notes outside the region stay in the clip but don't play, and a v0 edit
  // can't always reach them. The entry has to say so.
  it("counts the notes a shrink-only length cuts off", async () => {
    const clipId = await createMidiClip(0, "C3 1|1\nE3 2|1");

    const detail = await updateClipDetail({
      id: clipId,
      length: "1bar",
      notes: "G3 1|2",
    });

    expect(detail).toBe("1 note is outside the region and won't play");
  });

  it("counts the notes a far move leaves behind, and they return with the region", async () => {
    const clipId = await createMidiClip(0, "C3 1|1\nE3 2|1");

    const detail = await updateClipDetail({
      id: clipId,
      start: "5|1",
      length: "2bar",
      notes: "v0 C3 1|1\nG3 5|1",
    });

    expect(detail).toBe("2 notes are outside the region and won't play");

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, start: "1|1", length: "2bar" },
    });
    await sleep(100);

    const notes = await readClipNotes(clipId);

    expect(notes).toContain("C3");
    expect(notes).toContain("E3");
  });
});

describe("ppal-update-clip transform parse errors", () => {
  // A model reads the parse error to repair its transform, so the error must
  // name the fix, not just a position — and the clip stays as it was.
  it("names the fix for a malformed transform and leaves the notes alone", async () => {
    const clipId = await createMidiClip(0, "v100 C3 D3 1|1");
    const before = await readClipNotes(clipId);

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, transforms: "velocity rand(90,110)" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      'missing "=" after "velocity" — write "velocity = rand(90,110)"',
    );

    await sleep(100);

    expect(await readClipNotes(clipId)).toBe(before);
  });
});
