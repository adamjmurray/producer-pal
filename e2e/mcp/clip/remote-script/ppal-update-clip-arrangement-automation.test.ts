// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests that ppal-update-clip `envelopes` on an arrangement clip writes the
 * track's automation lane over exactly the clip's span, and gives the clip
 * back unchanged under a new id.
 *
 * The lane can't be read directly: each check moves the playhead and reads the
 * track's pan on a later call (see arrangement-lane-test-helpers.ts).
 *
 * Uses: e2e-test-set — t3 "Lead" (MIDI, one clip at 9|1 spanning 8 bars), t4
 * "Audio 1" (audio, a "kick" clip at 17|1), t8 for an anchor clip that keeps
 * the song long enough to read past the clips.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- clip/remote-script/ppal-update-clip-arrangement-automation
 */
import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import {
  parseToolResult,
  type ReadClipResult,
  setConfig,
  setupMcpTestContext,
  type UpdateClipResult,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";
import { skipBeforeLive } from "../../workflow/helpers/server-capability-test-helpers.ts";
import {
  beats,
  callTool,
  clipAt,
  readArrangementClips,
} from "../helpers/arrangement-clip-query-test-helpers.ts";
import { laneAt } from "../helpers/arrangement-lane-test-helpers.ts";
import { settledTool } from "../helpers/envelope-route-test-helpers.ts";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const MIDI_TRACK = 3;
const AUDIO_TRACK = 4;
/** Where t3's clip starts (bar 9) and t4's clip starts (bar 17), in beats. */
const MIDI_CLIP_START = 32;
const AUDIO_CLIP_START = 64;
const TOLERANCE = 0.03;
/** Bar 400, far past everything the cases write. */
const ANCHOR_BAR = 400;

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "ppal-update-clip — envelopes on an arrangement clip",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();

    skipBeforeLive(ctx, "12.4", "Envelope.create_event, which writes points");

    const lane = (track: number, songBeats: number): Promise<number> =>
      laneAt(ctx.client!, track, songBeats);

    const update = (args: Record<string, unknown>) =>
      settledTool<UpdateClipResult>(ctx.client!, "ppal-update-clip", args);

    /** A clip read less its id, which an envelopes write changes. */
    const readWithoutId = async (id: string) => {
      const { id: _id, ...rest } = parseToolResult<ReadClipResult>(
        await callTool(ctx.client!, "ppal-read-clip", {
          id,
          include: ["notes", "timing", "sample", "warp"],
        }),
      );

      return rest;
    };

    const clipOn = async (
      track: number,
      position: string,
    ): Promise<ReadClipResult> =>
      clipAt(
        await readArrangementClips(ctx.client!, track),
        position,
      ) as ReadClipResult;

    const expectLane = async (
      track: number,
      checks: Array<[songBeats: number, expected: number]>,
    ): Promise<void> => {
      for (const [songBeats, expected] of checks) {
        const read = await lane(track, songBeats);

        expect(
          Math.abs(read - expected),
          `lane at ${String(songBeats)}: read ${String(read)}, wanted ${String(expected)}`,
        ).toBeLessThan(TOLERANCE);
      }
    };

    beforeEach(async () => {
      await setConfig({ liveApiEnabled: true });
      await createClipInSlot(
        ctx,
        `t${String(EMPTY_MIDI_TRACK)}[${String(ANCHOR_BAR)}|1]`,
        { notes: "C3 1|1", length: "1bar" },
      );
    });

    it("writes a MIDI clip's lane over its span and gives the clip back under a new id", async () => {
      const first = await clipOn(MIDI_TRACK, "9|1");

      await update({
        id: first.id,
        name: "Lane test",
        notes: "C3 1|1 E3 3|1",
      });

      const before = await clipOn(MIDI_TRACK, "9|1");
      const kept = await readWithoutId(before.id as string);
      const baseline = await lane(MIDI_TRACK, MIDI_CLIP_START - 8);
      const spanBeats = beats(before.arrangementLength as string);

      const result = await update({
        id: before.id,
        envelopes: "pan: 1|1 -0.8 / 5|1 0.8",
      });

      expect(result).toStrictEqual(
        expect.objectContaining({ envelopes: 1, path: "t3[9|1]" }),
      );
      expect(result.id).not.toBe(before.id);
      await expectLane(MIDI_TRACK, [
        [MIDI_CLIP_START - 4, baseline],
        [MIDI_CLIP_START + 0.5, -0.8 + (0.5 / 16) * 1.6],
        [MIDI_CLIP_START + 8, 0],
        [MIDI_CLIP_START + 20, 0.8],
        [MIDI_CLIP_START + spanBeats + 4, baseline],
      ]);

      const after = await clipOn(MIDI_TRACK, "9|1");

      expect(after.id).toBe(result.id);
      expect(await readWithoutId(after.id as string)).toStrictEqual(kept);
    });

    it("leaves the clips beside it alone", async () => {
      await createClipInSlot(ctx, `t${String(MIDI_TRACK)}[5|1]`, {
        notes: "C3 1|1",
        length: "1bar",
      });
      await createClipInSlot(ctx, `t${String(MIDI_TRACK)}[17|1]`, {
        notes: "C3 1|1",
        length: "1bar",
      });

      const clips = await readArrangementClips(ctx.client!, MIDI_TRACK);
      const neighbors = [clipAt(clips, "5|1")?.id, clipAt(clips, "17|1")?.id];
      const target = clipAt(clips, "9|1") as ReadClipResult;

      await update({ id: target.id, envelopes: "pan: 1|1 0.5" });

      const after = await readArrangementClips(ctx.client!, MIDI_TRACK);

      expect(after).toHaveLength(3);
      expect([
        clipAt(after, "5|1")?.id,
        clipAt(after, "17|1")?.id,
      ]).toStrictEqual(neighbors);
    });

    it("refuses an empty line, since a lane can't be cleared, and changes nothing", async () => {
      const before = await clipOn(MIDI_TRACK, "9|1");
      const baseline = await lane(MIDI_TRACK, MIDI_CLIP_START + 8);

      const result = await update({ id: before.id, envelopes: "pan:" });

      expect(result).toStrictEqual(
        expect.objectContaining({
          id: before.id,
          envelopes: 0,
          detail: expect.stringContaining("not cleared") as string,
        }),
      );
      await expectLane(MIDI_TRACK, [[MIDI_CLIP_START + 8, baseline]]);
      expect((await clipOn(MIDI_TRACK, "9|1")).id).toBe(before.id);
    });

    it("writes an audio clip's lane and keeps its file, gain and warp markers", async () => {
      const clip = await clipOn(AUDIO_TRACK, "17|1");
      const before = await readWithoutId(clip.id as string);
      const baseline = await lane(AUDIO_TRACK, AUDIO_CLIP_START - 8);
      const spanBeats = beats(clip.arrangementLength as string);

      const result = await update({
        id: clip.id,
        envelopes: "pan: 1|1 -0.8 / 3|1 0.8",
      });

      expect(result).toStrictEqual(
        expect.objectContaining({ envelopes: 1, path: "t4[17|1]" }),
      );
      expect(result.id).not.toBe(clip.id);
      await expectLane(AUDIO_TRACK, [
        [AUDIO_CLIP_START - 4, baseline],
        [AUDIO_CLIP_START + 4, 0],
        [AUDIO_CLIP_START + 10, 0.8],
        [AUDIO_CLIP_START + spanBeats + 0.5, baseline],
      ]);
      expect(await readWithoutId(result.id)).toStrictEqual(before);
    });
  },
);
