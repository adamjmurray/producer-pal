// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for moving an arrangement clip back into a session slot.
 *
 * Live has no API that duplicates an arrangement clip into a slot, so the clip
 * is re-created there — MIDI from its notes, audio from its sample — and the
 * original deleted. Whether that re-creation is faithful is exactly what a mock
 * can't answer: the loop region, markers and audio settings are written back
 * one property at a time, and Live silently snaps several of them unless the
 * order is right. So the round trips live here.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track; t5 = audio track, only s0 filled)
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-arrangement-to-slot
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  DRUM_LOOP_FILE,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  arrangementClipAt,
  readClipDeep,
  updateClip,
} from "./arrangement-move-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

const MIDI_TRACK = 8;
const AUDIO_TRACK = 5;

describe("arrangement clip moved into a session slot", () => {
  it("re-creates the clip in the slot and clears the arrangement", async () => {
    const source = await createClip({
      path: `t${MIDI_TRACK}`,
      arrangementStart: "5|1",
      name: "Move Home",
      color: "#FF0000",
      notes: "C3 D3 E3 F3 1|1",
      length: "2bar",
    });

    // Live snaps a written color to its nearest palette entry, so the source's
    // own color is what the copy has to match, not the one asked for.
    const before = await readClipDeep(ctx.client!, { id: source.id });

    const { data: moved, warnings } = await updateClip(ctx.client!, source.id, {
      toPath: `t${MIDI_TRACK}/s1`,
    });

    expect(moved.path).toBe(`t${MIDI_TRACK}/s1`);
    expect(warnings.join(" ")).toContain(
      `arrangement clip ${source.id} was re-created at t${MIDI_TRACK}/s1`,
    );

    const clip = await readClipDeep(ctx.client!, { path: `t${MIDI_TRACK}/s1` });

    expect(clip.id).toBe(moved.id);
    expect(clip.view).toBe("session");
    expect(clip.name).toBe("Move Home");
    expect(clip.color).toBe(before.color);
    expect(clip.length).toBe("2bar");
    expect(clip.notes).toContain("C3");
    expect(clip.notes).toContain("F3");

    // The original is gone, not left behind as a copy.
    expect(
      await arrangementClipAt(ctx.client!, MIDI_TRACK, "5|1"),
    ).toBeUndefined();
  });

  // The marker properties are written in one fixed order because Live rejects
  // or snaps them in any other. A non-looping clip whose region starts partway
  // in is the case that catches a wrong order.
  it("carries a non-looping clip's start marker and length", async () => {
    const source = await createClip({
      path: `t${MIDI_TRACK}`,
      arrangementStart: "9|1",
      name: "Region",
      notes: "C3 1|1 D3 1|3 E3 2|1",
      length: "2bar",
    });

    await updateClip(ctx.client!, source.id, {
      looping: false,
      start: "1|3",
      length: "1bar",
    });

    const before = await readClipDeep(ctx.client!, { id: source.id });

    const { data: moved } = await updateClip(ctx.client!, source.id, {
      toPath: `t${MIDI_TRACK}/s2`,
    });
    const after = await readClipDeep(ctx.client!, { id: moved.id });

    expect(after.looping).toBe(false);
    expect(after.start).toBe(before.start);
    expect(after.length).toBe(before.length);
  });

  it("keeps a clip's time signature", async () => {
    const source = await createClip({
      path: `t${MIDI_TRACK}`,
      arrangementStart: "13|1",
      name: "Waltz",
      timeSignature: "3/4",
      notes: "C3 D3 E3 1|1",
      length: "2bar",
    });

    const { data: moved } = await updateClip(ctx.client!, source.id, {
      toPath: `t${MIDI_TRACK}/s3`,
    });

    expect(
      (await readClipDeep(ctx.client!, { id: moved.id })).timeSignature,
    ).toBe("3/4");
  });

  it("re-creates an audio clip from its sample", async () => {
    const source = await createClip({
      path: `t${AUDIO_TRACK}`,
      arrangementStart: "5|1",
      sampleFile: DRUM_LOOP_FILE,
      name: "Loop Home",
      warping: true,
      gainDb: -4.5,
      pitchShift: 3,
    });

    const before = await readClipDeep(ctx.client!, { id: source.id });

    const { data: moved } = await updateClip(ctx.client!, source.id, {
      toPath: `t${AUDIO_TRACK}/s2`,
    });
    const after = await readClipDeep(ctx.client!, { id: moved.id });

    expect(after.type).toBe("audio");
    expect(after.sampleFile).toBe(before.sampleFile);
    expect(after.warping).toBe(true);
    expect(after.gainDb).toBeCloseTo(-4.5, 1);
    expect(after.pitchShift).toBe(3);
    expect(after.length).toBe(before.length);
    expect(
      await arrangementClipAt(ctx.client!, AUDIO_TRACK, "5|1"),
    ).toBeUndefined();
  });

  it("warns before overwriting the clip already in the slot", async () => {
    const occupant = await createClip({
      path: `t${MIDI_TRACK}/s4`,
      name: "In The Way",
      notes: "G3 1|1",
    });
    const source = await createClip({
      path: `t${MIDI_TRACK}`,
      arrangementStart: "17|1",
      name: "Takes Over",
      notes: "C3 1|1",
      length: "1bar",
    });

    const { data: moved, warnings } = await updateClip(ctx.client!, source.id, {
      toPath: `t${MIDI_TRACK}/s4`,
    });

    expect(warnings.join(" ")).toContain(
      `overwrote the existing clip at t${MIDI_TRACK}/s4`,
    );
    expect(moved.id).not.toBe(occupant.id);
    expect(
      (await readClipDeep(ctx.client!, { path: `t${MIDI_TRACK}/s4` })).name,
    ).toBe("Takes Over");
  });

  // A "move" off a take lane would leave the original behind — Live's
  // delete_clip no-ops on one — so it's refused rather than turned into a copy.
  it("refuses a take-lane source and leaves it where it is", async () => {
    const source = await createClip({
      path: `t${MIDI_TRACK}/l+`,
      arrangementStart: "21|1",
      name: "On A Lane",
      notes: "C3 1|1",
      length: "1bar",
    });

    const { data: kept, warnings } = await updateClip(ctx.client!, source.id, {
      toPath: `t${MIDI_TRACK}/s5`,
    });

    expect(warnings.join(" ")).toContain(
      `clip ${source.id} was not moved: Live's API can't move a clip off a take lane`,
    );
    expect(kept.id).toBe(source.id);
    expect((await readClipDeep(ctx.client!, { id: source.id })).view).toBe(
      "arrangement",
    );
    expect(await slotIsEmpty(`t${MIDI_TRACK}/s5`)).toBe(true);
  });

  it("refuses a MIDI clip aimed at an audio track", async () => {
    const source = await createClip({
      path: `t${MIDI_TRACK}`,
      arrangementStart: "25|1",
      name: "Wrong Track",
      notes: "C3 1|1",
      length: "1bar",
    });

    const { data: kept, warnings } = await updateClip(ctx.client!, source.id, {
      toPath: `t${AUDIO_TRACK}/s3`,
    });

    expect(warnings.join(" ")).toContain(
      `clip ${source.id} was not moved: track ${AUDIO_TRACK} is audio`,
    );
    expect(kept.id).toBe(source.id);
    expect((await arrangementClipAt(ctx.client!, MIDI_TRACK, "25|1"))?.id).toBe(
      source.id,
    );
  });
});

/**
 * Create a clip and wait for Live to settle.
 * @param args - ppal-create-clip arguments
 * @returns The created clip
 */
async function createClip(
  args: Record<string, unknown>,
): Promise<CreateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: args,
  });

  await sleep(100);

  // Warnings are tolerated: creating on a take lane always warns that the lane
  // is hidden until the track's arrow is expanded.
  return parseToolResultWithWarnings<CreateClipResult>(result).data;
}

/**
 * Whether a clip slot is empty. Reading an empty slot warns rather than
 * failing, so this asks past the warning.
 * @param path - Clip slot path (e.g. "t8/s5")
 * @returns True when nothing is in the slot
 */
async function slotIsEmpty(path: string): Promise<boolean> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { path },
  });

  return parseToolResultWithWarnings<ReadClipResult>(result).data.id == null;
}
