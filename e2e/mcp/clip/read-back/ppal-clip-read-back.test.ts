// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for what ppal-update-clip says when Live keeps a different value
 * than the one written: a region, a time signature, the audio values. Every
 * write that lands is checked for a spurious read-back too, which is the
 * failure to watch for: Live stores a 32-bit float, and a position or a gain
 * must not read back as a change when it is the value that was written.
 *
 * Uses: e2e-test-set - t8 (empty MIDI track) plus an audio track it creates
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-read-back
 */
import { describe, expect, it } from "vitest";
import {
  type CreateTrackResult,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  createArrangementClip,
  updateAndRead,
} from "../helpers/clip-io-test-helpers.ts";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();

/** The fields a read-back adds to an entry. */
const READ_BACK_FIELDS = [
  "start",
  "length",
  "timeSignature",
  "gainDb",
  "pitchShift",
  "warpMode",
  "detail",
];

/**
 * Assert that an entry reports nothing about a value Live kept as written.
 * @param entry - The update's own entry for the clip
 */
function expectNoReadBack(entry: object): void {
  for (const field of READ_BACK_FIELDS) {
    expect(entry).not.toHaveProperty(field);
  }
}

describe("ppal-update-clip region read-back", () => {
  /** A looping clip at 5|1 to 6|1. */
  async function loopingClipAtBar5(slot: string): Promise<string> {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/${slot}`, {
      notes: "C3 1|1",
      looping: true,
    });

    await updateAndRead(ctx.client!, clipId, { start: "5|1", length: "1bar" });

    return clipId;
  }

  it("refuses a start at or past the loop end instead of claiming it", async () => {
    const clipId = await loopingClipAtBar5("s28");
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, start: "9|1" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("is not before the loop end");
  });

  it("refuses a length of zero", async () => {
    const clipId = await loopingClipAtBar5("s29");
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, length: "0bar" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("must be longer than zero");
  });

  it("says nothing when a looping clip's region lands as asked", async () => {
    const clipId = await loopingClipAtBar5("s30");
    const { entry, clip } = await updateAndRead(ctx.client!, clipId, {
      start: "9|1",
      length: "2bar",
    });

    expectNoReadBack(entry);
    expect(clip.start).toBe("9|1");
  });

  it("says nothing when an unlooped clip's region lands as asked", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s31`, {
      notes: "C3 1|1",
      looping: false,
      length: "2bar",
    });
    const { entry, clip } = await updateAndRead(ctx.client!, clipId, {
      start: "1|2",
      length: "1bar",
    });

    expectNoReadBack(entry);
    expect(clip.start).toBe("1|2");
  });

  it("says nothing when looping goes on with a start", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s32`, {
      notes: "C3 1|1",
      looping: false,
      length: "2bar",
    });
    const { entry, clip } = await updateAndRead(ctx.client!, clipId, {
      looping: true,
      start: "1|2",
    });

    expectNoReadBack(entry);
    expect(clip.looping).toBe(true);
    expect(clip.start).toBe("1|2");
  });

  // A bar of 6/8 is three beats of an eighth, so a beat with three decimals
  // lands on a float32 that rounds the other way.
  it("says nothing for a start with three decimals in a 6/8 clip", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s33`, {
      notes: "C3 1|1",
      timeSignature: "6/8",
      looping: true,
      length: "2bar",
    });
    const { entry } = await updateAndRead(ctx.client!, clipId, {
      start: "1|2.007",
      length: "1bar",
    });

    expectNoReadBack(entry);
  });

  it("says nothing when an arrangement clip's region lands as asked", async () => {
    const created = await createArrangementClip(
      ctx.client!,
      EMPTY_MIDI_TRACK,
      "60|1",
      { name: "Region Read Back", length: "2bar" },
    );
    const { entry } = await updateAndRead(ctx.client!, created.id, {
      start: "1|2",
      length: "1bar",
    });

    expectNoReadBack(entry);
  });

  it("refuses a time signature Live would change, writing nothing", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s34`, {
      notes: "C3 1|1",
    });
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, timeSignature: "4/3" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      'timeSignature "4/3" has a denominator Live can\'t keep',
    );
  });

  it("says nothing when the time signature lands as asked", async () => {
    const clipId = await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s35`, {
      notes: "C3 1|1",
    });
    const { entry, clip } = await updateAndRead(ctx.client!, clipId, {
      timeSignature: "7/8",
    });

    expectNoReadBack(entry);
    expect(clip.timeSignature).toBe("7/8");
  });
});

describe("ppal-update-clip audio read-back", () => {
  /**
   * An audio clip on a new audio track.
   * @param name - Track name
   * @returns The clip's id
   */
  async function audioClip(name: string): Promise<string> {
    const track = parseToolResult<CreateTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: { type: "audio", name },
      }),
    );

    await sleep(100);

    return createClipInSlot(ctx, `${track.path}/s0`, {
      sampleFile: SAMPLE_FILE,
    });
  }

  it("says nothing when Live keeps the gain, pitch and warp mode", async () => {
    const clipId = await audioClip("Read Back Audio");
    const { entry } = await updateAndRead(ctx.client!, clipId, {
      gainDb: -6,
      pitchShift: 2,
      warpMode: "complex",
    });

    expectNoReadBack(entry);
  });

  // The ends of the range: -70 is a gain of zero, 24 a gain of one.
  it.each([-70, 0, 24])("says nothing for a gain of %s dB", async (gainDb) => {
    const clipId = await audioClip(`Read Back Gain ${gainDb}`);
    const { entry } = await updateAndRead(ctx.client!, clipId, { gainDb });

    expectNoReadBack(entry);
  });

  // Live stores whole cents, so half a cent is a real change.
  it("reports the whole cents Live kept for a pitch shift between two cents", async () => {
    const clipId = await audioClip("Read Back Pitch");
    const { entry } = await updateAndRead(ctx.client!, clipId, {
      pitchShift: 3.255,
    });

    expect(entry.pitchShift).toBe(3.25);
    expect(entry.detail).toBe("pitchShift read back as shown, not as sent");
  });

  it("says nothing when a warped clip's region lands as asked", async () => {
    const clipId = await audioClip("Read Back Warped Region");

    await updateAndRead(ctx.client!, clipId, { warping: true });

    const { entry } = await updateAndRead(ctx.client!, clipId, {
      start: "1|1",
      length: "n/8",
    });

    expectNoReadBack(entry);
  });

  // The markers are seconds here, and the read converts them back by tempo.
  it("says nothing when an unwarped clip's region lands as asked", async () => {
    const clipId = await audioClip("Read Back Unwarped Region");

    await updateAndRead(ctx.client!, clipId, { warping: false });

    const { entry } = await updateAndRead(ctx.client!, clipId, {
      start: "1|1",
      length: "n/32",
    });

    expectNoReadBack(entry);
  });

  // Probe: if Live ignores a warp mode on an unwarped clip, this is where the
  // entry says so, and the expectation below changes to match.
  it("says nothing about a warp mode set on an unwarped clip that keeps it", async () => {
    const clipId = await audioClip("Read Back Unwarped Mode");

    await updateAndRead(ctx.client!, clipId, { warping: false });

    const { entry } = await updateAndRead(ctx.client!, clipId, {
      warpMode: "complex",
    });

    expectNoReadBack(entry);
  });
});
