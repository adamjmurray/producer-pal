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
 * - create-clip (interpreted notes),
 * - update-clip's transform-only path (re-adding mutated notes), and
 * - update-clip's merge path (existing + new notes).
 *
 * Genuine same-pitch+start duplicates can't be saved by sorting, so both tools
 * dedupe keep-last before the write, and the new note wins deterministically.
 * create-clip warns about the dropped duplicates (an accident in the input);
 * update-clip's merge stays quiet, since restating a note there is an
 * intentional overwrite.
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
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
  trackIndexFromPath,
  type UpdateClipResult,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

/**
 * Create a fresh MIDI track, so each test owns its clip slots and can't collide
 * with other suites sharing the Live session.
 * @param name - Track name
 * @returns The new track's index
 */
async function createOrderingTrack(name: string): Promise<number> {
  const track = parseToolResult<CreateTrackResult>(
    await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "midi", name },
    }),
  );

  await sleep(100);

  return trackIndexFromPath(track.path);
}

/**
 * Create a clip and assert how many notes Live actually stored. noteCount is
 * read back from the clip, so it is the survival count, not the input count.
 * @param path - Clip slot ("t<track>/s<scene>")
 * @param notes - bar|beat notation for the clip
 * @param noteCount - Expected stored note count
 * @returns The created clip
 */
async function createClipWithCount(
  path: string,
  notes: string,
  noteCount: number,
): Promise<CreateClipResult> {
  const created = parseToolResult<CreateClipResult>(
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path, notes },
    }),
  );

  expect(created.noteCount).toBe(noteCount);
  await sleep(100);

  return created;
}

/**
 * Read a clip's serialized notes for independent confirmation of a write.
 * @param clipId - Clip ID to read
 * @returns The clip's notes string ("" when it has none)
 */
async function readClipNotes(clipId: string): Promise<string> {
  const clip = parseToolResult<ReadClipResult>(
    await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clipId, include: ["notes"] },
    }),
  );

  return clip.notes ?? "";
}

describe("note write ordering (create + update transforms)", () => {
  it("create-clip sorts notes so onset overlaps don't drop them, and reports the actual stored count", async () => {
    const trackIndex = await createOrderingTrack("Note Ordering Track");

    // Authored out of order: the beat-2.5 quarter (start 1.5, spans to 2.5)
    // overruns the beat-3 onset (start 2.0). Written as authored, Live would
    // delete the beat-3 note and only 1 would survive. Sorting ascending leaves
    // only a tail overlap, which Live truncates — so BOTH notes survive. A
    // stored count of 2 proves it.
    const sorted = await createClipWithCount(
      `t${trackIndex}/s0`,
      "n/4 C1 1|3 1|2.5",
      2,
    );
    const sortedNotes = await readClipNotes(sorted.id);

    // Independent confirmation via read-clip: both C1 onsets are present
    // (the earlier note is truncated where the next begins, not deleted).
    expect(sortedNotes).toContain("1|2.5");
    expect(sortedNotes).toContain("1|3");

    // Two identical same-pitch + same-start notes. Sorting can't help — they're
    // genuine duplicates — so create-clip drops the earlier one before the write
    // (keep-last) and warns, rather than letting Live silently delete it. The
    // reported count is the actual stored 1, not the interpreted input 2.
    const dupResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${trackIndex}/s1`,
        notes: "C1 C1 1|1",
      },
    });
    const { data: dup, warnings: dupWarnings } =
      parseToolResultWithWarnings<CreateClipResult>(dupResult);

    expect(dupWarnings).toStrictEqual([
      "WARNING: Dropped 1 duplicate note at the same pitch and start",
    ]);
    expect(dup.noteCount).toBe(1);

    await sleep(100);

    expect(await readClipNotes(dup.id)).toContain("C1");
  });

  it("update-clip re-sorts after a transform reorders notes, so a same-pitch onset overlap doesn't drop one", async () => {
    const trackIndex = await createOrderingTrack("Transform Ordering Track");

    // Two non-overlapping C1 quarter notes at start 0 and start 2.
    const created = await createClipWithCount(
      `t${trackIndex}/s0`,
      "n/4 C1 1|1 1|3",
      2,
    );

    // Shift only the first note (start 0) to start 2.5. In memory this leaves the
    // notes out of start_time order ([2.5, 2]); re-adding them in that order would
    // let the start-2 note overrun the start-2.5 onset and make Live delete it.
    // Sorting before the re-add leaves only a tail overlap, so both survive.
    const updateResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        id: created.id,
        transforms: "1|1-1|2.5: timing += 2.5",
      },
    });
    const updated = parseToolResult<UpdateClipResult>(updateResult);

    // update-clip's noteCount is the actual read-back: 2 confirms the sort kept
    // both notes (without it, Live would delete the onset-overlapped one → 1).
    expect(updated.noteCount).toBe(2);
  });

  it("update-clip merge sorts + dedupes the combined existing+new notes before re-adding", async () => {
    const trackIndex = await createOrderingTrack("Merge Ordering Track");

    // Overlap-survival: existing C1 quarter at 1|3 (start 2, spans [2,3]).
    const created = await createClipWithCount(
      `t${trackIndex}/s0`,
      "n/4 C1 1|3",
      1,
    );

    // Merge a new C1 half note at 1|2 (start 1, spans [1,3]). The combined array
    // is existing@2 then new@1 — unsorted, Live would delete the existing onset.
    // Sorting before the re-add makes it a tail overlap, so both survive.
    const mergeResult = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        id: created.id,
        notes: "n/2 C1 1|2",
      },
    });
    const merged = parseToolResult<UpdateClipResult>(mergeResult);

    expect(merged.noteCount).toBe(2);
    await sleep(100);

    // Both onsets survived. Sorting writes the new note at 1|2 FIRST, so it is
    // the already-placed note when 1|3 lands inside its span — a tail overlap, so
    // Live clips the half at 1|2 down to a quarter and leaves the quarter at 1|3
    // untouched. Both end up quarter C1s and serialize as the canonical same-pitch
    // comma-list "C1 1|2,3" (C1 at beats 1|2 AND 1|3).
    //
    // NOTE: this assertion cannot distinguish WHICH note got truncated — both are
    // quarters either way. It is the sorted write order plus the tail-overlap rule
    // in note-sort.ts that makes it the 1|2 note; the assertion only proves neither
    // was deleted.
    expect(await readClipNotes(created.id)).toContain("C1 1|2,3");

    // Overwrite/dedupe: restating a note at the same pitch+start must not double
    // it up — the new note replaces the existing one (count stays 1).
    const dupCreated = await createClipWithCount(
      `t${trackIndex}/s1`,
      "n/2 C1 1|1",
      1,
    );

    const overwrite = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        id: dupCreated.id,
        notes: "n/4 C1 1|1",
      },
    });
    const overwritten = parseToolResult<UpdateClipResult>(overwrite);

    expect(overwritten.noteCount).toBe(1);
  });
});
