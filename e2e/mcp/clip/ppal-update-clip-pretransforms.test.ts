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
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-pretransforms
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
  type UpdateClipResult,
} from "../mcp-test-helpers.ts";
import { createClipTransformHelpers } from "./helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();
const { createMidiClip, readClipNotes } = createClipTransformHelpers(ctx);

describe("ppal-update-clip preTransforms", () => {
  it("clears all existing notes with a bare preTransforms (no notes arg)", async () => {
    const clipId = await createMidiClip(0, "C3 D3 E3 1|1");

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clipId, preTransforms: "v0" },
    });
    const updated = parseToolResult<UpdateClipResult>(result);

    await sleep(100);

    expect(updated.noteCount).toBe(0);
    expect(await readClipNotes(clipId)).toBe("");
  });

  it("edits existing notes in place with a bare preTransforms (no merge)", async () => {
    const clipId = await createMidiClip(0, "v100 C3 D3 E3 1|1");

    // Bare edit: set velocity on every existing note. Note count must stay 3 —
    // this proves preTransforms edits in place rather than merging a copy.
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clipId, preTransforms: "v50" },
    });
    const updated = parseToolResult<UpdateClipResult>(result);

    await sleep(100);

    expect(updated.noteCount).toBe(3);

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
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clipId,
        preTransforms: "1|1-1|4: v0",
        notes: "C4 1|1",
      },
    });
    const updated = parseToolResult<UpdateClipResult>(result);

    await sleep(100);

    // 1 merged (C4) + 2 preserved (G3, A3)
    expect(updated.noteCount).toBe(3);

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

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clipId, preTransforms: "C1: C4" },
    });
    const updated = parseToolResult<UpdateClipResult>(result);

    await sleep(100);

    // Remap moves pitch in place; the 4 notes stay 4 notes.
    expect(updated.noteCount).toBe(4);

    const notes = await readClipNotes(clipId);

    expect(notes).toContain("C4");
    expect(notes).not.toContain("C1");
  });
});
