// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the sort-ascending-by-start_time-before-add_new_notes invariant.
 *
 * Live deletes an earlier same-pitch note when a later-written note overlaps its
 * onset, so notes must be written in ascending start_time order or they can be
 * silently dropped. Both write paths sort before the write:
 * - create-clip (interpreted notes), and
 * - update-clip's transform-only path (re-adding mutated notes).
 *
 * Also covers create-clip's noteCount reporting the count Live actually stored
 * (read back) rather than the interpreted-input count.
 *
 * Each test creates its own fresh MIDI track to avoid clip-slot collisions with
 * other suites that share the Live session.
 *
 * Run with: npm run e2e:mcp -- ppal-note-write-ordering
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  type CreateTrackResult,
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
  type UpdateClipResult,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("note write ordering (create + update transforms)", () => {
  it("create-clip sorts notes so onset overlaps don't drop them, and reports the actual stored count", async () => {
    const trackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "midi", name: "Note Ordering Track" },
    });
    const track = parseToolResult<CreateTrackResult>(trackResult);

    expect(track.trackIndex).toBeDefined();
    await sleep(100);

    // Authored out of order: the beat-2.5 quarter (start 1.5, spans to 2.5)
    // overruns the beat-3 onset (start 2.0). Written as authored, Live would
    // delete the beat-3 note and only 1 would survive. Sorting ascending leaves
    // only a tail overlap, which Live truncates — so BOTH notes survive.
    const sortResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${track.trackIndex}/0`,
        notes: "n/4 C1 1|3 1|2.5",
      },
    });
    const sorted = parseToolResult<CreateClipResult>(sortResult);

    // create's noteCount is read back from the clip (getPlayableNoteCount), so
    // a value of 2 proves both notes survived the write.
    expect(sorted.noteCount).toBe(2);

    await sleep(100);
    const verifySorted = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: sorted.id, include: ["notes"] },
    });
    const sortedClip = parseToolResult<ReadClipResult>(verifySorted);

    // Independent confirmation via read-clip: both C1 onsets are present
    // (the earlier note is truncated where the next begins, not deleted).
    expect(sortedClip.notes).toContain("1|2.5");
    expect(sortedClip.notes).toContain("1|3");

    // Two identical same-pitch + same-start notes. Live collapses them to one
    // (sorting can't help — they're genuine duplicates), so the reported count
    // must be the actual stored 1, not the interpreted input 2.
    const dupResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${track.trackIndex}/1`,
        notes: "C1 C1 1|1",
      },
    });
    const dup = parseToolResult<CreateClipResult>(dupResult);

    expect(dup.noteCount).toBe(1);

    await sleep(100);
    const verifyDup = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: dup.id, include: ["notes"] },
    });
    const dupClip = parseToolResult<ReadClipResult>(verifyDup);

    expect(dupClip.notes).toContain("C1");
  });

  it("update-clip re-sorts after a transform reorders notes, so a same-pitch onset overlap doesn't drop one", async () => {
    const trackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "midi", name: "Transform Ordering Track" },
    });
    const track = parseToolResult<CreateTrackResult>(trackResult);

    expect(track.trackIndex).toBeDefined();
    await sleep(100);

    // Two non-overlapping C1 quarter notes at start 0 and start 2.
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${track.trackIndex}/0`,
        notes: "n/4 C1 1|1 1|3",
      },
    });
    const created = parseToolResult<CreateClipResult>(createResult);

    expect(created.noteCount).toBe(2);
    await sleep(100);

    // Shift only the first note (start 0) to start 2.5. In memory this leaves the
    // notes out of start_time order ([2.5, 2]); re-adding them in that order would
    // let the start-2 note overrun the start-2.5 onset and make Live delete it.
    // Sorting before the re-add leaves only a tail overlap, so both survive.
    const updateResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: created.id,
        transforms: "1|1-1|2.5: timing += 2.5",
      },
    });
    const updated = parseToolResult<UpdateClipResult>(updateResult);

    // update-clip's noteCount is the actual read-back: 2 confirms the sort kept
    // both notes (without it, Live would delete the onset-overlapped one → 1).
    expect(updated.noteCount).toBe(2);
  });
});
