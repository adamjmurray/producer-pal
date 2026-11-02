// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for a MIDI clip's own scale (Live 12.4.15 and later): what
 * ppal-read-clip shows, what ppal-create-clip and ppal-update-clip write, and
 * the scale transforms snap to.
 *
 * Every test starts with the Live Set in C Major and makes its clips after, as
 * a new clip copies the Live Set's scale when it is made.
 *
 * Uses: e2e-test-set - t8 (empty MIDI track) plus an audio track it creates
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-scale
 */
import { beforeEach, describe, expect, it } from "vitest";
import { intervalsToPitchClasses } from "#src/shared/pitch.ts";
import { VALID_SCALE_NAMES } from "#src/tools/constants.ts";
import { SCALE_INTERVALS } from "#src/tools/shared/schema/scale/scale-intervals.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  type CreateClipResult,
  type CreateTrackResult,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { readClipFully, updateClip } from "../helpers/clip-io-test-helpers.ts";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();

/** Out of C Major and of C minor pentatonic. C Major snaps it up to D. */
const OUT_OF_SCALE_NOTE = "Db3 1|1";
const SNAP = "pitch = snap(note.pitch)";

/**
 * Set the Live Set's scale.
 * @param scale - Like "C Major", or "" for none
 */
async function setSongScale(scale: string): Promise<void> {
  await ctx.client!.callTool({
    name: "ppal-update-live-set",
    arguments: { scale },
  });
  await sleep(100);
}

/**
 * Make a MIDI clip in a slot of the empty MIDI track.
 * @param scene - The slot's scene index
 * @param args - The rest of the ppal-create-clip arguments
 * @returns The clip's id
 */
async function makeClip(
  scene: number,
  args: Record<string, unknown> = {},
): Promise<string> {
  return await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s${scene}`, {
    notes: OUT_OF_SCALE_NOTE,
    ...args,
  });
}

/**
 * Make a one-bar looping MIDI clip on the empty MIDI track's arrangement.
 * @param position - Where it starts, in bar|beat
 * @returns The clip's id
 */
async function makeArrangementClip(position: string): Promise<string> {
  return await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}[${position}]`, {
    notes: OUT_OF_SCALE_NOTE,
    length: "1bar",
    looping: true,
  });
}

/**
 * Read a clip with its notes.
 * @param id - The clip's id
 * @returns The clip
 */
async function readNotes(id: string): Promise<ReadClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { id, include: ["notes"] },
  });

  return parseToolResult<ReadClipResult>(result);
}

describe("ppal-clip-scale", () => {
  beforeEach(async () => {
    await setSongScale("C Major");
  });

  describe("ppal-read-clip", () => {
    it("shows a clip's scale only when it differs from the Live Set's", async () => {
      const id = await makeClip(0);
      const same = await readClipFully(ctx.client!, { id });

      expect(same).not.toHaveProperty("scale");
      expect(same).not.toHaveProperty("scalePitches");

      await updateClip(ctx.client!, id, { scale: "D Dorian" });

      const different = await readClipFully(ctx.client!, { id });

      expect(different.scale).toBe("D Dorian");
      expect(different.scalePitches).toBe("D,E,F,G,A,B,C");

      await updateClip(ctx.client!, id, { scale: "C Major" });

      expect(await readClipFully(ctx.client!, { id })).not.toHaveProperty(
        "scale",
      );
    });

    it('shows scale: "" for a clip with no scale while the Live Set has one', async () => {
      const id = await makeClip(1);

      await updateClip(ctx.client!, id, { scale: "" });

      const clip = await readClipFully(ctx.client!, { id });

      expect(clip.scale).toBe("");
      expect(clip).not.toHaveProperty("scalePitches");
    });

    it("shows a clip's scale while the Live Set has none, and nothing when neither does", async () => {
      const id = await makeClip(2);

      await setSongScale("");
      await updateClip(ctx.client!, id, { scale: "C Major" });

      const clip = await readClipFully(ctx.client!, { id });

      expect(clip.scale).toBe("C Major");
      expect(clip.scalePitches).toBe("C,D,E,F,G,A,B");

      await updateClip(ctx.client!, id, { scale: "" });

      expect(await readClipFully(ctx.client!, { id })).not.toHaveProperty(
        "scale",
      );
    });
  });

  describe("ppal-update-clip", () => {
    it("sets one clip's scale and leaves the Live Set's and other clips' alone", async () => {
      const id = await makeClip(3);
      const other = await makeClip(4);

      const { data } = await updateClip(ctx.client!, id, { scale: "E Minor" });

      expect(data).not.toHaveProperty("scale");
      expect((await readClipFully(ctx.client!, { id })).scale).toBe("E Minor");
      expect(
        await readClipFully(ctx.client!, { id: other }),
      ).not.toHaveProperty("scale");

      const liveSet = parseToolResult<{ scale?: string }>(
        await ctx.client!.callTool({
          name: "ppal-read-live-set",
          arguments: {},
        }),
      );

      expect(liveSet.scale).toBe("C Major");
    });

    it("gives each clip of a list its own scale", async () => {
      const first = await makeClip(5);
      const second = await makeClip(6);

      await updateClip(ctx.client!, `${first},${second}`, {
        scale: "E Minor,F Lydian",
      });

      expect((await readClipFully(ctx.client!, { id: first })).scale).toBe(
        "E Minor",
      );
      expect((await readClipFully(ctx.client!, { id: second })).scale).toBe(
        "F Lydian",
      );
    });

    it("reports a sharp root by the flat name Live stores", async () => {
      const id = await makeClip(7);

      const { data } = await updateClip(ctx.client!, id, {
        scale: "F# Dorian",
      });

      expect(data.scale).toBe("Gb Dorian");
      expect(data.detail).toContain("F# comes back as Gb");
    });

    it("refuses a scale Live doesn't have, touching nothing", async () => {
      const id = await makeClip(8);
      const result = await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { id, name: "Renamed", scale: "C Nonsense" },
      });

      expect(isToolError(result)).toBe(true);
      expect(getToolErrorMessage(result)).toContain(
        "Invalid scale name 'Nonsense'",
      );
      expect((await readClipFully(ctx.client!, { id })).name).not.toBe(
        "Renamed",
      );
    });

    it("keeps the scale on a clip moved to another slot in the same call", async () => {
      const id = await makeClip(17);
      const { data } = await updateClip(ctx.client!, id, {
        scale: "D Dorian",
        toPath: `t${EMPTY_MIDI_TRACK}/s18`,
      });

      expect(data.path).toBe(`t${EMPTY_MIDI_TRACK}/s18`);

      const moved = await readClipFully(ctx.client!, { id: data.id });

      expect(moved.scale).toBe("D Dorian");
      expect(moved.scalePitches).toBe("D,E,F,G,A,B,C");
    });

    it("keeps the scale on an arrangement clip moved in the same call", async () => {
      const id = await makeArrangementClip("33|1");
      const { data } = await updateClip(ctx.client!, id, {
        scale: "E Minor",
        toPath: "[41|1]",
      });
      const moved = await readClipFully(ctx.client!, { id: data.id });

      expect(moved.path).toBe(`t${EMPTY_MIDI_TRACK}[41|1]`);
      expect(moved.scale).toBe("E Minor");
    });

    it("keeps the scale on every clip an arrangementLength lengthening makes", async () => {
      const id = await makeArrangementClip("49|1");
      const { data } = await updateClip(ctx.client!, id, {
        scale: "E Minor",
        arrangementLength: "3bar",
      });
      const entries = (Array.isArray(data) ? data : [data]) as ReadClipResult[];

      expect(entries.length).toBeGreaterThan(1);

      const scales = [];

      for (const entry of entries) {
        scales.push((await readClipFully(ctx.client!, { id: entry.id })).scale);
      }

      expect(scales).toStrictEqual(entries.map(() => "E Minor"));
    });

    it("ignores the scale on an audio clip and says so", async () => {
      const track = parseToolResult<CreateTrackResult>(
        await ctx.client!.callTool({
          name: "ppal-create-track",
          arguments: { type: "audio", name: "Clip Scale Audio" },
        }),
      );

      await sleep(100);

      const audioId = await createClipInSlot(ctx, `${track.path}/s0`, {
        sampleFile: SAMPLE_FILE,
      });
      const midiId = await makeClip(9);
      const result = parseToolResult<ReadClipResult[]>(
        await ctx.client!.callTool({
          name: "ppal-update-clip",
          arguments: { id: `${midiId},${audioId}`, scale: "D Dorian" },
        }),
      );

      expect(result[0]).not.toHaveProperty("ok");
      expect(result[1]).toStrictEqual(
        expect.objectContaining({
          ok: false,
          detail: "scale ignored: the clip is audio",
        }),
      );
      expect((await readClipFully(ctx.client!, { id: midiId })).scale).toBe(
        "D Dorian",
      );
    });
  });

  describe("ppal-create-clip", () => {
    it("makes a clip with the scale asked for", async () => {
      const result = parseToolResult<CreateClipResult>(
        await ctx.client!.callTool({
          name: "ppal-create-clip",
          arguments: {
            path: `t${EMPTY_MIDI_TRACK}/s10`,
            notes: OUT_OF_SCALE_NOTE,
            scale: "G Mixolydian",
          },
        }),
      );

      await sleep(100);

      expect(result).not.toHaveProperty("scale");

      const clip = await readClipFully(ctx.client!, { id: result.id });

      expect(clip.scale).toBe("G Mixolydian");
      expect(clip.scalePitches).toBe("G,A,B,C,D,E,F");
    });

    it("makes a clip with no scale from a blank", async () => {
      const id = await makeClip(11, { scale: "" });

      expect((await readClipFully(ctx.client!, { id })).scale).toBe("");
    });

    it("gives the intervals Live holds for every scale a caller can name", async () => {
      // Create-clip snaps a new clip's transforms to the scale it asks for
      // before the clip exists, so it holds its own copy of each scale's
      // intervals. This is what keeps that copy honest.
      await setSongScale("");

      const first = 40;
      const paths = VALID_SCALE_NAMES.map(
        (_name, i) => `t${EMPTY_MIDI_TRACK}/s${first + i}`,
      );
      const created = parseToolResult<CreateClipResult[]>(
        await ctx.client!.callTool({
          name: "ppal-create-clip",
          arguments: {
            path: paths.join(","),
            scale: VALID_SCALE_NAMES.map((name) => `C ${name}`).join(","),
          },
        }),
      );

      await sleep(200);

      const held: Record<string, unknown> = {};
      const expected: Record<string, unknown> = {};

      for (const [i, name] of VALID_SCALE_NAMES.entries()) {
        const clip = await readClipFully(ctx.client!, {
          id: (created[i] as CreateClipResult).id,
        });

        held[name] = { scale: clip.scale, scalePitches: clip.scalePitches };
        expected[name] = {
          scale: `C ${name}`,
          scalePitches: intervalsToPitchClasses(
            [...SCALE_INTERVALS[name]],
            0,
          ).join(","),
        };
      }

      expect(held).toStrictEqual(expected);
    });
  });

  describe("transforms", () => {
    it("snap to the clip's scale, not the Live Set's", async () => {
      const id = await makeClip(12);

      await updateClip(ctx.client!, id, { scale: "C Minor Pentatonic" });
      await updateClip(ctx.client!, id, { transforms: SNAP });

      // The Live Set's C Major would send Db3 up to D3.
      const { notes } = await readNotes(id);

      expect(notes).toContain("C3");
      expect(notes).not.toContain("D3");
    });

    it("snap to a scale set in the same call", async () => {
      const id = await makeClip(13);

      await updateClip(ctx.client!, id, {
        scale: "C Minor Pentatonic",
        transforms: SNAP,
      });

      const { notes } = await readNotes(id);

      expect(notes).toContain("C3");
    });

    it("do not snap a clip whose scale is off, though the Live Set's is on", async () => {
      const id = await makeClip(14);

      await updateClip(ctx.client!, id, { scale: "", transforms: SNAP });

      const { notes } = await readNotes(id);

      expect(notes).toContain("Db3");
    });

    it("snap a new clip's notes to the scale the same create asks for", async () => {
      const id = await makeClip(15, {
        scale: "C Minor Pentatonic",
        transforms: SNAP,
      });

      const { notes } = await readNotes(id);

      expect(notes).toContain("C3");
      expect(notes).not.toContain("D3");
    });

    it("snap a new clip's notes to the Live Set's scale when none is asked for", async () => {
      const id = await makeClip(16, { transforms: SNAP });

      const { notes } = await readNotes(id);

      expect(notes).toContain("D3");
    });
  });
});
