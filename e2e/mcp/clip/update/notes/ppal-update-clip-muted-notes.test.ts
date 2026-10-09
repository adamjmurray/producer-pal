// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for muted notes: read-clip hides them and reports `mutedNotes`,
 * and edits leave them in place as if they weren't there.
 * Uses: e2e-test-set - tests create clips in empty slots (t8 is empty MIDI track)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-muted-notes
 */
import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_MIDI_TRACK } from "../../../e2e-test-set.ts";
import {
  parseToolResult,
  type ReadClipResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../../mcp-test-helpers.ts";
import {
  createClipWithMutedNote,
  readNoteDicts,
} from "../../helpers/clip-io-test-helpers.ts";

const ctx = setupMcpTestContext();

const E3 = 64;

beforeEach(async () => {
  await setConfig({ liveApiEnabled: true });
  await sleep(50);
});

/**
 * Read a clip's notes.
 * @param clipId - The clip's Live API id
 * @returns The read-clip result with notes included
 */
async function readNotes(clipId: string): Promise<ReadClipResult> {
  return parseToolResult<ReadClipResult>(
    await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clipId, include: ["notes"] },
    }),
  );
}

/**
 * Update a clip.
 * @param clipId - The clip's Live API id
 * @param args - Extra update-clip arguments
 * @returns The update result
 */
async function updateClip(
  clipId: string,
  args: Record<string, unknown>,
): Promise<{ noteCount?: number; detail?: string }> {
  const result = parseToolResult<{ noteCount?: number; detail?: string }>(
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, ...args },
    }),
  );

  await sleep(100);

  return result;
}

describe("muted notes", () => {
  it("are hidden from read-clip and counted in mutedNotes", async () => {
    const clipId = await createClipWithMutedNote(ctx.client!, 0);
    const clip = await readNotes(clipId);

    expect(clip.notes).toContain("C3");
    expect(clip.notes).toContain("G3");
    expect(clip.notes).not.toContain("E3");
    expect(clip.mutedNotes).toBe(1);
  });

  it("are counted in mutedNotes on a clip inside a track read", async () => {
    const clipId = await createClipWithMutedNote(ctx.client!, 4);
    const track = parseToolResult<{
      sessionClips?: Array<{ id: string; notes?: string; mutedNotes?: number }>;
    }>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: {
          path: `t${EMPTY_MIDI_TRACK}`,
          include: ["session-clips", "notes"],
        },
      }),
    );
    const clip = track.sessionClips?.find((entry) => entry.id === clipId);

    expect(clip?.mutedNotes).toBe(1);
    expect(clip?.notes).not.toContain("E3");
  });

  it("stay muted and unchanged through a transform", async () => {
    const clipId = await createClipWithMutedNote(ctx.client!, 1);
    const result = await updateClip(clipId, { transforms: "velocity = 20" });

    expect(result.noteCount).toBe(2);

    const dicts = await readNoteDicts(ctx.client!, clipId);
    const muted = dicts.find((note) => note.pitch === E3);

    expect(dicts).toHaveLength(3);
    expect(muted).toStrictEqual(
      expect.objectContaining({ mute: 1, velocity: 90, start_time: 2 }),
    );
    expect(
      dicts.filter((note) => note.pitch !== E3).map((note) => note.velocity),
    ).toStrictEqual([20, 20]);
  });

  it("stay muted when new notes merge in", async () => {
    const clipId = await createClipWithMutedNote(ctx.client!, 2);
    const result = await updateClip(clipId, { notes: "A3 1|2" });

    expect(result.noteCount).toBe(3);
    expect(await readNoteDicts(ctx.client!, clipId)).toContainEqual(
      expect.objectContaining({ pitch: E3, mute: 1, start_time: 2 }),
    );
    expect((await readNotes(clipId)).mutedNotes).toBe(1);
  });

  it("are replaced by a note written at the same pitch and start", async () => {
    const clipId = await createClipWithMutedNote(ctx.client!, 3);

    const result = await updateClip(clipId, { notes: "E3 1|3" });

    // Replacing a muted note is not a duplicate, so nothing is reported.
    expect(result.detail).toBeUndefined();

    const dicts = await readNoteDicts(ctx.client!, clipId);

    expect(dicts.filter((note) => note.pitch === E3)).toStrictEqual([
      expect.objectContaining({ mute: 0, start_time: 2 }),
    ]);
    expect((await readNotes(clipId)).mutedNotes).toBeUndefined();
  });

  it("are not counted as notes outside the region", async () => {
    // G3 (beat 4) and the muted E3 (beat 3) both fall past a 2-beat region.
    const clipId = await createClipWithMutedNote(ctx.client!, 5);
    const result = await updateClip(clipId, { length: "n/2", notes: "A3 1|1" });

    expect(result.detail).toBe("1 note is outside the region and won't play");
  });
});

describe("writes that land on a muted note", () => {
  it("say a transform replaced it", async () => {
    // The new C3 at 1|3 moves up to E3, onto the muted E3 at the same start (the
    // old C3 at 1|1 moves too, but lands on nothing).
    const clipId = await createClipWithMutedNote(ctx.client!, 6);
    const result = await updateClip(clipId, {
      notes: "C3 1|3",
      transforms: "C3: pitch += 4",
    });

    expect(result.detail).toBe(
      "replaced 1 muted note at the same pitch and start",
    );
    expect((await readNotes(clipId)).mutedNotes).toBeUndefined();
  });

  it("say a muted note shortened a new note", async () => {
    // A half note E3 at 1|2 runs into the muted E3 at 1|3; Live cuts it there.
    const clipId = await createClipWithMutedNote(ctx.client!, 7);
    const result = await updateClip(clipId, { notes: "n/2 E3 1|2" });

    expect(result.detail).toBe("1 note shortened by an overlapping muted note");

    const visible = (await readNoteDicts(ctx.client!, clipId)).find(
      (note) => note.pitch === E3 && note.mute === 0,
    );

    expect(visible?.duration).toBe(1);
  });

  it("say a new note shortened a muted note", async () => {
    // An E3 at 1|3.5 starts inside the muted E3 (beat 3, one beat long).
    const clipId = await createClipWithMutedNote(ctx.client!, 8);
    const result = await updateClip(clipId, { notes: "E3 1|3.5" });

    expect(result.detail).toBe("1 muted note shortened by an overlapping note");
  });

  it("say quantize moved the muted note", async () => {
    // 2.1 is off the quarter-note grid, so quantize really moves it
    const clipId = await createClipWithMutedNote(ctx.client!, 9, 2.1);
    const result = await updateClip(clipId, { quantizeGrid: "1/4" });

    expect(result.detail).toBe("quantized 1 muted note");
  });

  it("say nothing when quantize leaves the muted note where it was", async () => {
    const clipId = await createClipWithMutedNote(ctx.client!, 12);
    const result = await updateClip(clipId, { quantizeGrid: "1/4" });

    expect(result.detail).toBeUndefined();
  });

  it("say quantize moved a muted note in a clip of only muted notes", async () => {
    const clipId = await createClipWithMutedNote(ctx.client!, 10, 2.1);

    await updateClip(clipId, { preTransforms: "delete" });

    const result = await updateClip(clipId, { quantizeGrid: "1/4" });

    expect(result.detail).toBe("quantized 1 muted note");
  });

  it("say quantize moved nothing in a clip of only muted notes already on the grid", async () => {
    const clipId = await createClipWithMutedNote(ctx.client!, 13);

    await updateClip(clipId, { preTransforms: "delete" });

    const result = await updateClip(clipId, { quantizeGrid: "1/4" });

    expect(result.detail).toBe(
      "quantize moved nothing: the clip has only muted notes, and none moved",
    );
  });

  it("say duplicateLoop copied the muted note", async () => {
    const clipId = await createClipWithMutedNote(ctx.client!, 11);
    const result = await updateClip(clipId, { duplicateLoop: true });

    expect(result.detail).toBe("duplicateLoop copied 1 muted note");
    expect((await readNotes(clipId)).mutedNotes).toBe(2);
  });
});
