// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for moving an arrangement clip to another track or take lane.
 *
 * A move is copy-then-delete, so a destination Live silently declines would
 * destroy the source and report a move. Only real Live says which destinations
 * it takes — `duplicate_clip_to_arrangement` no-ops on a type mismatch without
 * reporting anything, and a take lane needs the clip re-created from scratch.
 * So both halves are pinned here: the copy lands where it was asked to, and the
 * source is gone from where it was.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track; t7, t10 = MIDI tracks with no
 * clips; t5 = audio track)
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-arrangement-move
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  parseToolResultWithWarnings,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  arrangementClipAt,
  expectRefusedUpdate,
  readClipFully,
  updateClip,
} from "../helpers/clip-io-test-helpers.ts";
import {
  AUDIO_TRACK,
  CHILD_TRACK,
  EMPTY_MIDI_TRACK,
  RACKS_TRACK,
} from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

describe("arrangement clip moved to another lane", () => {
  it("moves the clip to another track and clears the source", async () => {
    const source = await createClip("5|1", "Crosser");

    const { data: moved } = await updateClip(ctx.client!, source.id, {
      toPath: `t${RACKS_TRACK}[9|1]`,
    });

    expect(moved.path).toBe(`t${RACKS_TRACK}[9|1]`);

    const placed = await arrangementClipAt(ctx.client!, RACKS_TRACK, "9|1");

    expect(placed?.id).toBe(moved.id);
    expect(placed?.name).toBe("Crosser");
    expect(
      await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "5|1"),
    ).toBeUndefined();
  });

  // toPath alone is "same place, other track" — the clip keeps its position.
  it("keeps the clip's position when toPath names no position", async () => {
    const source = await createClip("13|1", "Stays At 13");

    const { data: moved } = await updateClip(ctx.client!, source.id, {
      toPath: `t${RACKS_TRACK}`,
    });

    expect(
      (await arrangementClipAt(ctx.client!, RACKS_TRACK, "13|1"))?.id,
    ).toBe(moved.id);
    expect(
      await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "13|1"),
    ).toBeUndefined();
  });

  // A take lane has no duplicate API, so the clip is rebuilt from its notes.
  it("re-creates the clip on a fresh take lane", async () => {
    const source = await createClip("17|1", "On A Lane");

    const { data: moved, warnings } = await updateClip(ctx.client!, source.id, {
      toPath: `t${CHILD_TRACK}/l+`,
    });

    expect(warnings.join(" ")).toContain(
      `clip ${source.path} (id ${source.id}) was re-created on t${CHILD_TRACK}/l`,
    );
    expect(moved.path).toMatch(
      new RegExp(`^t${CHILD_TRACK}/l\\d+\\[17\\|1\\]$`),
    );

    const placed = await readClipFully(ctx.client!, { id: moved.id });

    expect(placed.name).toBe("On A Lane");
    expect(placed.notes).toContain("C3");
    expect(
      await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "17|1"),
    ).toBeUndefined();
  });

  it("refuses a MIDI clip aimed at an audio track and keeps it where it is", async () => {
    const source = await createClip("21|1", "Wrong Track");

    await expectRefusedUpdate(
      ctx.client!,
      source.id,
      { toPath: `t${AUDIO_TRACK}[25|1]` },
      `clip ${source.path} (id ${source.id}) was not moved: track ${AUDIO_TRACK} is audio`,
    );

    expect(
      (await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "21|1"))?.id,
    ).toBe(source.id);
  });

  // Live's delete_clip no-ops on a take-lane clip, so the move copies the
  // content and empties the original where it stands.
  it("moves a MIDI take off its lane, leaving an emptied clip behind", async () => {
    const source = await createClip("29|1", "Lane Bound", `/l+`);

    const { data: moved, warnings } = await updateClip(ctx.client!, source.id, {
      toPath: `t${RACKS_TRACK}[33|1]`,
    });

    expect(warnings.join(" ")).toContain(
      `clip ${source.path} (id ${source.id}) was emptied instead of deleted`,
    );

    const placed = await readClipFully(ctx.client!, { id: moved.id });

    expect(placed.path).toBe(`t${RACKS_TRACK}[33|1]`);
    expect(placed.name).toBe("Lane Bound");
    expect(placed.notes).toContain("C3");

    // The take stays on its lane, emptied, muted, and marked for cleanup.
    const leftover = await readClipFully(ctx.client!, { id: source.id });

    expect(leftover.name).toBe("(moved) Lane Bound");
    // read-clip omits both when a clip holds no notes.
    expect(leftover.noteCount).toBeUndefined();
    expect(leftover.notes).toBeUndefined();
    expect(leftover.muted).toBe(true);
  });

  // An audio take can't be emptied — its sample can't be cleared, and a silent
  // clip can't be stretched over it — so it is muted and marked instead.
  it("moves an audio take off its lane, leaving the take muted", async () => {
    const source = await createAudioClip("5|1", "Audio Take");

    const { data: moved, warnings } = await updateClip(ctx.client!, source.id, {
      toPath: `t${AUDIO_TRACK}[9|1]`,
    });

    expect(warnings.join(" ")).toContain(
      `clip ${source.path} (id ${source.id}) was muted instead of deleted`,
    );

    const placed = await readClipFully(ctx.client!, { id: moved.id });

    expect(placed.path).toBe(`t${AUDIO_TRACK}[9|1]`);
    expect(placed.sampleFile).toBe(SAMPLE_FILE);

    const leftover = await readClipFully(ctx.client!, { id: source.id });

    expect(leftover.name).toBe("(moved) Audio Take");
    expect(leftover.muted).toBe(true);
  });
});

/**
 * Create an audio clip on a fresh take lane of the audio track.
 * @param position - Position in bar|beat format
 * @param name - Clip name
 * @returns The created clip
 */
async function createAudioClip(
  position: string,
  name: string,
): Promise<CreateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      path: `t${AUDIO_TRACK}/l+[${position}]`,
      name,
      sampleFile: SAMPLE_FILE,
    },
  });

  await sleep(100);

  return parseToolResultWithWarnings<CreateClipResult>(result).data;
}

/**
 * Create a MIDI clip in the source track's arrangement.
 * @param position - Position in bar|beat format
 * @param name - Clip name
 * @param laneSuffix - Path suffix naming a take lane (e.g. "/l+")
 * @returns The created clip
 */
async function createClip(
  position: string,
  name: string,
  laneSuffix = "",
): Promise<CreateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      path: `t${EMPTY_MIDI_TRACK}${laneSuffix}[${position}]`,
      name,
      notes: "C3 D3 E3 F3 1|1",
      length: "1bar",
    },
  });

  await sleep(100);

  // Warnings are tolerated: creating on a take lane always warns that the lane
  // is hidden until the track's arrow is expanded.
  return parseToolResultWithWarnings<CreateClipResult>(result).data;
}
