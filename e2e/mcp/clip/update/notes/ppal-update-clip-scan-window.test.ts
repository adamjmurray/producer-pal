// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the note scan window on a looping clip whose end_marker sits
 * past loop_end.
 *
 * A note starting at or past loop_end never plays, so on a looping clip every
 * note read and edit stops at loop_end: read-clip leaves such a note out, and
 * no edit (here, a transform) reads, rewrites or removes it. Live keeps
 * end_marker out at 16 on a looped clip with loop_end at 4, which is what
 * makes the window's end a choice rather than a given.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track)
 *
 * Run with: npm run e2e:mcp -- clip/update/notes/ppal-update-clip-scan-window
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../../e2e-test-set.ts";
import {
  readClipFully,
  updateClip,
} from "../../helpers/clip-io-test-helpers.ts";
import {
  readEveryNote,
  readRegion,
  writeRegion,
} from "../../helpers/clip-region-test-helpers.ts";

const ctx = setupMcpTestContext();

beforeEach(async () => {
  await setConfig({ liveApiEnabled: true });
});

/**
 * A 4-bar looping clip holding C3 on beat 0 and E3 on beat 10 (bar 3, beat 3),
 * then narrowed to loop 0..4 with end_marker put back out at 16. That leaves E3
 * past loop_end, where it never plays.
 * @returns The clip's id
 */
async function loopedClipWithFarEnd(): Promise<string> {
  const created = parseToolResult<CreateClipResult>(
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s0`,
        notes: "C3 1|1 E3 3|3",
        length: "4bar",
        looping: true,
      },
    }),
  );

  await sleep(100);
  await writeRegion(ctx.client!, created.id, {
    looping: true,
    loop_start: 0,
    loop_end: 4,
    start_marker: 0,
    end_marker: 16,
  });

  return created.id;
}

describe("note scan window on a looping clip with end_marker past loop_end", () => {
  it("reads only the notes inside the loop", async () => {
    const clipId = await loopedClipWithFarEnd();

    // Live keeps the far end_marker; the window ignores it on a looping clip.
    expect((await readRegion(ctx.client!, clipId)).end_marker).toBe(16);

    const clip = await readClipFully(ctx.client!, { id: clipId });

    // A looping clip reports its loop brace, not the markers.
    expect(clip.looping).toBe(true);
    expect(clip.start).toBe("1|1");
    expect(clip.end).toBe("2|1");
    expect(clip.notes).toContain("C3");
    expect(clip.notes).not.toContain("E3");
  });

  it("leaves a note past loop_end untouched when legato() rewrites the clip", async () => {
    const clipId = await loopedClipWithFarEnd();
    const before = await readEveryNote(ctx.client!, clipId);

    expect(before.map((note) => note.pitch)).toStrictEqual([60, 64]);

    await updateClip(ctx.client!, clipId, {
      transforms: "duration = legato()",
    });

    const after = await readEveryNote(ctx.client!, clipId);

    expect(after).toHaveLength(2);
    // The note past the loop is exactly as it was; the one inside was edited.
    expect(after[1]).toStrictEqual(before[1]);
    expect(after[0]!.pitch).toBe(60);
  });
});
