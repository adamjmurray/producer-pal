// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for create-clip note ordering and count reporting.
 *
 * Covers two related fixes:
 * - Notes are sorted ascending by start_time before add_new_notes, so an
 *   out-of-order same-pitch onset overlap no longer makes Live delete a note.
 * - noteCount reports the count Live actually stored (read back), not the
 *   interpreted-input count, so it can't silently over-report dropped notes.
 *
 * Creates its own fresh MIDI track to avoid clip-slot collisions with other
 * suites that share the Live session.
 *
 * Run with: npm run e2e:mcp -- ppal-create-clip-note-ordering
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  type CreateTrackResult,
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-create-clip note ordering and count", () => {
  it("sorts notes before writing so onset overlaps don't drop notes, and reports the actual stored count", async () => {
    const trackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "midi", name: "Note Ordering Track" },
    });
    const track = parseToolResult<CreateTrackResult>(trackResult);

    expect(track.trackIndex).toBeDefined();
    await sleep(100);

    // AJM-501: authored out of order — the beat-2.5 quarter (start 1.5, spans to
    // 2.5) overruns the beat-3 onset (start 2.0). Written as authored, Live would
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

    // AJM-500: two identical same-pitch + same-start notes. Live collapses them
    // to one (sorting can't help — they're genuine duplicates), so the reported
    // count must be the actual stored 1, not the interpreted input 2.
    const dupResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        slot: `${track.trackIndex}/1`,
        notes: "C1 C1 1|1",
      },
    });
    const dup = parseToolResult<CreateClipResult>(dupResult);

    // create's noteCount is the actual read-back: 1, not the interpreted input 2.
    // (Genuine same-pitch+same-start duplicates serialize identically whether 1
    // or 2 were written, so the read-back count is the only collapse evidence.)
    expect(dup.noteCount).toBe(1);

    await sleep(100);
    const verifyDup = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { clipId: dup.id, include: ["notes"] },
    });
    const dupClip = parseToolResult<ReadClipResult>(verifyDup);

    expect(dupClip.notes).toContain("C1");
  });
});
