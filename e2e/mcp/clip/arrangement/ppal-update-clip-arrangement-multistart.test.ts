// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for multi-clip arrangement start operations.
 * Tests the crash fix (clearClipAtDuplicateTarget before duplication)
 * and non-survivor optimization (skipping moves for covered clips).
 * Uses: e2e-test-set — t8 is the empty MIDI track for dynamic clip creation.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- --testPathPattern ppal-update-clip-arrangement-multistart
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { readClipsOnTrack } from "../helpers/arrangement-lengthening-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import { arrangementStartOf } from "../helpers/arrangement-start-test-helpers.ts";

const ctx = setupMcpTestContext();

/**
 * Create an arrangement clip and return its ID.
 * @param trackIndex - Track to create on
 * @param position - Bar|beat position
 * @param length - Clip length in absolute note-value format (e.g. "1bar", "n/2")
 * @returns Clip ID
 */
async function createArrangementClip(
  trackIndex: number,
  position: string,
  length: string,
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      path: `t${trackIndex}[${position}]`,
      notes: "C3 1|1",
      length,
      looping: true,
    },
  });

  return parseToolResult<{ id: string }>(result).id;
}

/**
 * Parse update-clip result handling single object or array.
 * Uses parseToolResultWithWarnings since arrangement moves emit expected warnings.
 * @param result - Raw tool result
 * @returns Parsed clips and warnings
 */
function parseUpdateResults(result: unknown): {
  clips: UpdatedClip[];
  warnings: string[];
} {
  const { data, warnings } = parseToolResultWithWarnings<
    UpdatedClip | UpdatedClip[]
  >(result);

  return {
    clips: Array.isArray(data) ? data : [data],
    warnings,
  };
}

/** What one clip's entry says about the move. */
interface UpdatedClip {
  id: string;
  path?: string;
  reason?: string;
  deleted?: boolean;
  arrangementLength?: string;
}

/**
 * Create clips on the empty MIDI track, move them all to one destination, and
 * read the track back.
 * @param sources - [position, length] for each clip to create, in call order
 * @param toPath - Where the clips move to, e.g. "[170|1]"
 * @returns The move's per-clip entries and the clips left on the track
 */
async function moveClipsTo(
  sources: [position: string, length: string][],
  toPath: string,
): Promise<{
  clips: UpdatedClip[];
  finalClips: ReadClipResult[];
}> {
  const ids: string[] = [];

  for (const [position, length] of sources) {
    ids.push(await createArrangementClip(EMPTY_MIDI_TRACK, position, length));
  }

  await sleep(200);

  const { clips } = parseUpdateResults(
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: ids.join(","), toPath },
    }),
  );

  await sleep(200);

  const { clips: finalClips } = await readClipsOnTrack(
    ctx.client!,
    EMPTY_MIDI_TRACK,
  );

  return { clips, finalClips };
}

/**
 * Assert each entry's `deleted` flag, in call order.
 * @param clips - The move's per-clip entries
 * @param deleted - The expected flag per entry
 */
function expectDeleted(
  clips: UpdatedClip[],
  deleted: (true | undefined)[],
): void {
  expect(clips.map((clip) => clip.deleted)).toStrictEqual(deleted);
}

describe("ppal-update-clip arrangement multistart", () => {
  it("moves clip to position with existing clip without crashing", async () => {
    // Existing clip at target position
    await createArrangementClip(EMPTY_MIDI_TRACK, "101|1", "1bar");
    await sleep(200);

    // Another clip to move there
    const movingId = await createArrangementClip(
      EMPTY_MIDI_TRACK,
      "105|1",
      "2bar",
    );

    await sleep(200);

    // Should not crash (clearClipAtDuplicateTarget handles existing clip)
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: movingId, toPath: "[101|1]" },
    });
    const movedClip = parseToolResult<{ id: string }>(result);

    await sleep(200);

    const readResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: movedClip.id, include: ["timing"] },
    });
    const clip = parseToolResult<ReadClipResult>(readResult);

    expect(arrangementStartOf(clip)).toBe("101|1");
  });

  it("deletes non-survivors and keeps survivors", async () => {
    // A(4 beats), B(8 beats), C(2 beats)
    // Backwards: C(2)>0 survives, B(8)>2 survives, A(4)<=8 non-survivor
    const { clips, finalClips } = await moveClipsTo(
      [
        ["151|1", "1bar"],
        ["155|1", "2bar"],
        ["159|1", "n/2"],
      ],
      "[170|1]",
    );

    // Every target gets an entry, in the order the call named them. A is the
    // non-survivor, and says so rather than going unmentioned.
    expectDeleted(clips, [true, undefined, undefined]);

    // Verify final state: 2 clips on track
    expect(finalClips).toHaveLength(2);
    expect(arrangementStartOf(finalClips[0]!)).toBe("170|1");
  });

  // Survivors descend in length, but a non-survivor can outlast a later, shorter
  // one. A(20) is buried by B(40); C(12) survives on top of B without being long
  // enough to bury A on its own. The clearing gate has to compare lengths, not
  // just ask whether some survivor landed.
  it("buries a non-survivor only under a landing long enough to cover it", async () => {
    const { clips, finalClips } = await moveClipsTo(
      [
        ["301|1", "5bar"],
        ["311|1", "10bar"],
        ["325|1", "3bar"],
      ],
      "[340|1]",
    );

    // A is the only non-survivor, and B's landing is what buries it.
    expectDeleted(clips, [true, undefined, undefined]);

    // B underneath, C stacked on its front — A gone, nothing left at 301|1.
    expect(finalClips).toHaveLength(2);
    expect(arrangementStartOf(finalClips[0]!)).toBe("340|1");
  });

  it("only last clip survives when all have same length", async () => {
    // 3 clips of 4 beats (1 bar) each
    const { clips, finalClips } = await moveClipsTo(
      [
        ["201|1", "1bar"],
        ["205|1", "1bar"],
        ["209|1", "1bar"],
      ],
      "[220|1]",
    );

    // Same length: only the last survives (4>0), the first two are buried by
    // it — and each of them says so in its own entry.
    expect(clips).toHaveLength(3);
    expect(clips[0]?.deleted).toBe(true);
    expect(clips[1]?.deleted).toBe(true);
    expect(clips[2]?.deleted).toBeUndefined();

    expect(finalClips).toHaveLength(1);
    expect(arrangementStartOf(finalClips[0]!)).toBe("220|1");
    expect(finalClips[0]!.arrangementLength).toBe("1bar");
  });

  it("all clips survive when in descending length order", async () => {
    // A(8 beats), B(4 beats), C(2 beats) — descending order
    const { clips, finalClips } = await moveClipsTo(
      [
        ["251|1", "2bar"],
        ["255|1", "1bar"],
        ["259|1", "n/2"],
      ],
      "[270|1]",
    );

    // All survive: C(2)>0, B(4)>2, A(8)>4. Each of the first two is trimmed by
    // the next, which re-creates it — trimmed is not deleted, and the entry
    // has to name the clip that is really there.
    expectDeleted(clips, [undefined, undefined, undefined]);
    // C sits at the target; A's remainder starts a bar in, B's half a bar in.
    expect(clips.map((clip) => clip.path)).toStrictEqual([
      `t${EMPTY_MIDI_TRACK}[271|1]`,
      `t${EMPTY_MIDI_TRACK}[270|3]`,
      `t${EMPTY_MIDI_TRACK}[270|1]`,
    ]);
    // B and C each cut the front off the clip they landed on, and say where
    // what is left of it now starts.
    const trimmed = "trimmed: another clip in this call landed on its start";

    expect(clips.map((clip) => clip.reason)).toStrictEqual([
      trimmed,
      `shortened the clip at t${EMPTY_MIDI_TRACK}[271|1]; ${trimmed}`,
      `shortened the clip at t${EMPTY_MIDI_TRACK}[270|3]`,
    ]);
    // A trimmed entry says how much is left: A(8) minus B(4), B(4) minus C(2).
    expect(clips.map((clip) => clip.arrangementLength)).toStrictEqual([
      "1bar",
      "n/2",
      undefined,
    ]);

    // 3 clips on track, stacked at target position
    expect(finalClips).toHaveLength(3);
    expect(arrangementStartOf(finalClips[0]!)).toBe("270|1");
    // Every reported id is one of the clips that ended up on the track.
    const onTrack = finalClips.map((clip) => clip.id);

    for (const clip of clips) {
      expect(onTrack).toContain(clip.id);
    }
  });

  // A second group lands right where A's remainder is predicted to start.
  // A(8) at 401|1 is trimmed to 403|1 by B(2); C(12) lands at 403|1 too, and
  // buries the remainder outright. C must not be mistaken for A.
  it("reports a remainder buried by another group as deleted", async () => {
    const { clips, finalClips } = await moveClipsTo(
      [
        ["381|1", "2bar"],
        ["385|1", "n/2"],
        ["389|1", "3bar"],
      ],
      "[401|1],[401|1],[401|3]",
    );

    expectDeleted(clips, [true, undefined, undefined]);
    expect(clips[0]?.id).not.toBe(clips[2]?.id);

    expect(finalClips).toHaveLength(2);
  });

  // Same shape with a shorter C(4): it trims A's remainder again instead of
  // burying it, so A's entry has to follow the remainder past C.
  it("follows a remainder trimmed again by another group", async () => {
    const { clips, finalClips } = await moveClipsTo(
      [
        ["421|1", "2bar"],
        ["425|1", "n/2"],
        ["429|1", "1bar"],
      ],
      "[441|1],[441|1],[441|3]",
    );

    expectDeleted(clips, [undefined, undefined, undefined]);
    expect(clips[0]?.path).toBe(`t${EMPTY_MIDI_TRACK}[442|3]`);
    expect(clips[0]?.reason).toContain("trimmed:");
    expect(clips[0]?.id).not.toBe(clips[2]?.id);

    expect(finalClips).toHaveLength(3);
    expect(finalClips.map((clip) => clip.id)).toContain(clips[0]?.id);
  });
});
