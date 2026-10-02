// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
import { readNoteDicts } from "../../helpers/clip-io-test-helpers.ts";

const ctx = setupMcpTestContext();

const E3 = 64;

beforeEach(async () => {
  await setConfig({ liveApiEnabled: true });
  await sleep(50);
});

/**
 * Create a one-bar clip holding C3 on beat 1 and G3 on beat 4, plus a muted E3
 * on beat 3 written straight through Live.
 *
 * ppal-live-api passes only scalars, and a JSON string is how the dictionary
 * `add_new_notes` wants gets through. Never use Live's older note protocol
 * (select_all_notes/replace_selected_notes/notes/note/done) — it pops a modal
 * dialog that stalls every Live call until someone dismisses it.
 * @param sceneIndex - Session scene index for the slot
 * @returns The clip's id
 */
async function createClipWithMutedNote(sceneIndex: number): Promise<string> {
  const created = parseToolResult<{ id: string }>(
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s${sceneIndex}`,
        notes: "C3 1|1 G3 1|4",
        length: "1bar",
      },
    }),
  );

  await ctx.client!.callTool({
    name: "ppal-live-api",
    arguments: {
      path: `id ${created.id}`,
      operations: [
        {
          type: "call",
          method: "add_new_notes",
          args: [
            JSON.stringify({
              notes: [
                {
                  pitch: E3,
                  start_time: 2,
                  duration: 1,
                  velocity: 90,
                  mute: 1,
                },
              ],
            }),
          ],
        },
      ],
    },
  });
  await sleep(100);

  return created.id;
}

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
    const clipId = await createClipWithMutedNote(0);
    const clip = await readNotes(clipId);

    expect(clip.notes).toContain("C3");
    expect(clip.notes).toContain("G3");
    expect(clip.notes).not.toContain("E3");
    expect(clip.mutedNotes).toBe(1);
  });

  it("are counted in mutedNotes on a clip inside a track read", async () => {
    const clipId = await createClipWithMutedNote(4);
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
    const clipId = await createClipWithMutedNote(1);
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
    const clipId = await createClipWithMutedNote(2);
    const result = await updateClip(clipId, { notes: "A3 1|2" });

    expect(result.noteCount).toBe(3);
    expect(await readNoteDicts(ctx.client!, clipId)).toContainEqual(
      expect.objectContaining({ pitch: E3, mute: 1, start_time: 2 }),
    );
    expect((await readNotes(clipId)).mutedNotes).toBe(1);
  });

  it("are replaced by a note written at the same pitch and start", async () => {
    const clipId = await createClipWithMutedNote(3);

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
    const clipId = await createClipWithMutedNote(5);
    const result = await updateClip(clipId, { length: "n/2", notes: "A3 1|1" });

    expect(result.detail).toBe("1 note is outside the region and won't play");
  });
});
