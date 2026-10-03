// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the params ppal-update-clip can do nothing with on a given
 * clip. Each one is a reason on that clip's own entry, never a warning, and a
 * skip where it was all the call asked for.
 *
 * Uses: e2e-test-set - t8 (empty MIDI track) plus audio tracks it creates
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-ignored-params
 */
import { describe, expect, it } from "vitest";
import {
  type CreateTrackResult,
  getToolErrorMessage,
  getToolWarnings,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";
import { updateAndRead } from "../helpers/clip-io-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

describe("ppal-update-clip ignored params", () => {
  // A param the clip can do nothing with belongs on that clip's entry, not in a
  // warning: the model reads the entry.
  it("reports an ignored param on the clip's own entry", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s26`, {
      notes: "C3 1|1",
    });

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, looping: false, firstStart: "2|1" },
    });
    const { data, warnings } =
      parseToolResultWithWarnings<ReadClipResult>(result);

    // looping landed, so the ignored firstStart is a reason on a real entry.
    expect(data.detail).toContain(
      "firstStart ignored: the clip is not looping",
    );
    expect(warnings.join(" ")).not.toContain("firstStart");
  });

  // A MIDI clip has no sample, so the audio params wrote nothing — one reason
  // naming all of them, beside the rename that did land.
  it("reports the audio params a MIDI clip ignored on its own entry", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s5`, {
      notes: "C3 1|1",
    });

    const { clip, entry, warnings } = await updateAndRead(ctx.client!, clipId, {
      name: "Renamed Anyway",
      gainDb: 3,
      pitchShift: -2,
    });

    expect(entry.detail).toContain(
      "gainDb/pitchShift ignored: the clip is MIDI",
    );
    expect(entry).not.toHaveProperty("ok");
    expect(clip.name).toBe("Renamed Anyway");
    expect(warnings.join(" ")).not.toContain("gainDb");
  });

  it("refuses a lone MIDI clip sent only an audio param", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s6`, {
      notes: "C3 1|1",
    });

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, gainDb: 3 },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "gainDb ignored: the clip is MIDI",
    );
  });

  it("refuses a call that names a clip and asks nothing of it", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s27`, {
      notes: "C3 1|1",
    });

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, focus: false },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("nothing to update");
  });

  // Nothing else was asked of the one clip named, so the reason comes back as
  // the error rather than an entry nobody can pair against a list.
  it("refuses a lone clip whose only param it can do nothing with", async () => {
    const clipId = await audioClipOnNewTrack("Lone Refusal Track");

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, notes: "C3 1|1" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "notes ignored: the clip is audio",
    );
  });

  // A split is work that landed, so every piece keeps its entry even when the
  // only other param was one the clip could do nothing with. Without that the
  // pieces collapse onto the one target they share, and the call throws after
  // the clip has already been cut.
  it("keeps every piece of a split whose other param the clip ignored", async () => {
    const track = await createAudioTrack("Split Reason Track");

    const created = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path: `${track.path}[1|1]`, sampleFile: SAMPLE_FILE },
    });
    const clip = parseToolResult<ReadClipResult>(created);

    await sleep(100);

    // One beat in, so any sample of at least two beats splits in two.
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clip.id, arrangementSplit: "1|2", quantize: 1 },
    });
    const { data, warnings } =
      parseToolResultWithWarnings<ReadClipResult[]>(result);

    expect(data).toHaveLength(2);

    for (const entry of data) {
      expect(entry).not.toHaveProperty("ok");
      expect(entry.detail).toContain("quantize ignored: the clip is audio");
    }

    expect(warnings.join(" ")).not.toContain("quantize");
  });

  // A transform for the other kind of clip does nothing there. It answers the
  // way the matching param does: on the entry, never as a warning.
  it("refuses a lone MIDI clip sent only a gain transform", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s7`, {
      notes: "C3 1|1",
    });

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, transforms: "gain = -3" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "gain ignored: the clip is MIDI",
    );
    expect(getToolWarnings(result)).toStrictEqual([]);
  });

  it("puts a wrong-type transform on each clip's own entry in a batch", async () => {
    const midiId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s8`, {
      notes: "C3 1|1",
    });
    const audioId = await audioClipOnNewTrack("Wrong Type Transform Track");

    // gain applies to the audio clip and is refused on the MIDI one
    const gain = parseToolResultWithWarnings<ReadClipResult[]>(
      await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { id: `${midiId},${audioId}`, transforms: "gain = -3" },
      }),
    );

    expect(gain.data[0]).toStrictEqual(
      expect.objectContaining({
        ok: false,
        detail: "gain ignored: the clip is MIDI",
      }),
    );
    expect(gain.data[1]).not.toHaveProperty("ok");
    expect(gain.warnings).toStrictEqual([]);

    // velocity applies to the MIDI clip and is refused on the audio one
    const velocity = parseToolResultWithWarnings<ReadClipResult[]>(
      await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { id: `${midiId},${audioId}`, transforms: "velocity = 50" },
      }),
    );

    expect(velocity.data[0]).not.toHaveProperty("ok");
    expect(velocity.data[1]).toStrictEqual(
      expect.objectContaining({
        ok: false,
        detail: "velocity ignored: the clip is audio",
      }),
    );
    expect(velocity.warnings).toStrictEqual([]);
  });

  it("refuses an audio clip's unparseable transform like a MIDI clip's", async () => {
    const clipId = await audioClipOnNewTrack("Audio Parse Track");

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, transforms: "gain = =" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolWarnings(result)).toStrictEqual([]);
  });
});

/**
 * Create an audio track and let Live settle.
 * @param name - Track name
 * @returns The new track's metadata
 */
async function createAudioTrack(name: string): Promise<CreateTrackResult> {
  const track = parseToolResult<CreateTrackResult>(
    await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name },
    }),
  );

  await sleep(100);

  return track;
}

/**
 * Put a sample clip in slot 0 of a new audio track.
 * @param trackName - Name for the new track
 * @returns The clip's id
 */
async function audioClipOnNewTrack(trackName: string): Promise<string> {
  const track = await createAudioTrack(trackName);

  return createClipInSlot(ctx, `${track.path}/s0`, {
    sampleFile: SAMPLE_FILE,
  });
}
