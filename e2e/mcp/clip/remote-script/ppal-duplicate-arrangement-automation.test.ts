// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests that copying an automated session clip (or scene) to the
 * arrangement at another length writes the track's automation lane right:
 * the clip's automation over the span, looping with the clip, and nothing
 * stray past the target.
 *
 * The lane can't be read directly, so each check moves the playhead (transport
 * stopped, Song.back_to_arranger off) and reads the track's pan on the NEXT
 * call: the value follows the lane on Live's next update tick, about 100 ms.
 *
 * Every clip ramps pan up by 0.1 a beat from -0.8, holding its last value to
 * the clip's end (a 2-bar MIDI clip loops 8 beats, a 1-bar warped audio clip 4).
 * The copy's entry says it wrote the lane, and says nothing for a clip with no
 * automation (t3/s1).
 *
 * Uses: e2e-test-set — t3 "Lead" (MIDI) and t5 "Audio 2" (audio) with s2, s3,
 * s4, s6 and s7 free in both; t8 holds an anchor clip so the song is long
 * enough to read anywhere in the test range.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- clip/remote-script/ppal-duplicate-arrangement-automation
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  AUDIO_TRACK,
  DRUM_LOOP_FILE,
  EMPTY_MIDI_TRACK,
} from "../../e2e-test-set.ts";
import {
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
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
  readArrangementClips,
} from "../helpers/arrangement-clip-query-test-helpers.ts";
import { arrangementStartOf } from "../helpers/arrangement-start-test-helpers.ts";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";
import { settledTool } from "../helpers/envelope-route-test-helpers.ts";
import { laneAt as readLaneAt } from "../helpers/arrangement-lane-test-helpers.ts";

const MIDI_TRACK = 3;
/** Beats each kind of clip loops, and where its ramp stops climbing. */
const LOOP_BEATS = { midi: 8, audio: 4 } as const;
const TRACKS = { midi: MIDI_TRACK, audio: AUDIO_TRACK } as const;
const FIRST_VALUE = -0.8;
const STEP_PER_BEAT = 0.1;
const TOLERANCE = 0.03;
/** Bar 400, far past everything the cases write. */
const ANCHOR_BAR = 400;
/** What a copy's entry says when Live wrote the clip's automation to the lane. */
const LANE_WRITE_NOTE =
  "wrote its automation to the track's arrangement lane over this span";

type Kind = keyof typeof TRACKS;

describe.skipIf(!REMOTE_SCRIPT_E2E)(
  "ppal-duplicate — automation at another length",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext({ once: true });

    skipBeforeLive(ctx, "12.4", "Envelope.create_event, which writes points");

    /** Read the track's pan at a song time. */
    const laneAt = (trackIndex: number, songBeats: number): Promise<number> =>
      readLaneAt(ctx.client!, trackIndex, songBeats);

    /** What the lane should read `into` beats into a copy of a looping clip. */
    const ramp = (kind: Kind, into: number): number => {
      const loop = LOOP_BEATS[kind];
      const phase = into % loop;

      return FIRST_VALUE + STEP_PER_BEAT * Math.min(phase, loop - 1);
    };

    const expectLane = async (
      kind: Kind,
      start: number,
      checks: Array<[into: number, expected: number | "baseline"]>,
      baseline: number,
    ): Promise<void> => {
      for (const [into, expected] of checks) {
        const read = await laneAt(TRACKS[kind], start + into);
        const want = expected === "baseline" ? baseline : expected;

        expect(
          Math.abs(read - want),
          `${kind} lane ${String(into)} beats in: read ${String(read)}, wanted ${String(want)}`,
        ).toBeLessThan(TOLERANCE);
      }
    };

    /** A session clip whose pan ramps up, in a free slot. */
    const automatedClip = async (kind: Kind, slot: number): Promise<string> => {
      const path = `t${String(TRACKS[kind])}/s${String(slot)}`;
      const id =
        kind === "midi"
          ? await createClipInSlot(ctx, path, {
              notes: "C3 1|1",
              length: "2bar",
              looping: true,
            })
          : await createClipInSlot(ctx, path, {
              sampleFile: DRUM_LOOP_FILE,
              warping: true,
            });
      const last = LOOP_BEATS[kind] - 1;
      const lastBar = Math.floor(last / 4) + 1;
      const lastValue = FIRST_VALUE + STEP_PER_BEAT * last;

      const written = await settledTool<UpdateClipResult>(
        ctx.client!,
        "ppal-update-clip",
        {
          id,
          ...(kind === "audio" && { looping: true }),
          envelopes: `pan: 1|1 ${String(FIRST_VALUE)} / ${String(lastBar)}|${String((last % 4) + 1)} ${lastValue.toFixed(1)}`,
        },
      );

      expect(written).toStrictEqual(expect.objectContaining({ envelopes: 1 }));

      return id;
    };

    const copyClip = async (
      source: { id: string } | { path: string },
      track: number,
      bar: number,
      arrangementLength?: string,
    ): Promise<string> => {
      const result = await callTool(ctx.client!, "ppal-duplicate", {
        type: "clip",
        ...source,
        toPath: `t${String(track)}[${String(bar)}|1]`,
        ...(arrangementLength != null && { arrangementLength }),
      });

      await sleep(200);

      return JSON.stringify(parseToolResult(result));
    };

    /** Where a track's last arrangement clip ends, in beats. */
    const lastClipEnd = async (trackIndex: number): Promise<number> => {
      const clips = await readArrangementClips(ctx.client!, trackIndex);

      return Math.max(
        0,
        ...clips.map((clip) => {
          const [bar, beat] = (arrangementStartOf(clip) ?? "1|1")
            .split("|")
            .map(Number);

          return (
            ((bar as number) - 1) * 4 +
            ((beat as number) - 1) +
            beats(clip.arrangementLength ?? "n0/4")
          );
        }),
      );
    };

    /** The pan with no automation, read where no lane has been written. */
    let baseline: number | undefined;

    /** The anchor clip and the quiet pan, once, after the config is set. */
    const prepare = async (): Promise<void> => {
      if (baseline !== undefined) {
        return;
      }

      await createClipInSlot(
        ctx,
        `t${String(EMPTY_MIDI_TRACK)}[${String(ANCHOR_BAR)}|1]`,
        { notes: "C3 1|1", length: "1bar" },
      );
      baseline = await laneAt(MIDI_TRACK, 8);
      expect(await laneAt(AUDIO_TRACK, 8)).toBeCloseTo(baseline, 2);
    };

    beforeEach(async () => {
      await setConfig({ liveApiEnabled: true });
      await prepare();
    });

    it.each(["midi", "audio"] as const)(
      "writes only the first part of a looping %s clip when the copy is shorter",
      async (kind) => {
        const track = TRACKS[kind];
        const holding = await lastClipEnd(track);
        const length = kind === "midi" ? 4 : 2;

        await copyClip(
          { id: await automatedClip(kind, 2) },
          track,
          101,
          `n${String(length)}/4`,
        );

        const start = 400;

        await expectLane(
          kind,
          start,
          [
            [-2, "baseline"],
            [0.5, ramp(kind, 0.5)],
            [length - 0.5, ramp(kind, length - 0.5)],
            [length + 1.5, "baseline"],
            [length + 6.5, "baseline"],
          ],
          baseline as number,
        );

        // Where the holding area used to be put the clip: nothing stray there.
        for (const into of [0.5, 2.5, 6.5]) {
          expect(
            Math.abs(
              (await laneAt(track, holding + into)) - (baseline as number),
            ),
          ).toBeLessThan(TOLERANCE);
        }
      },
    );

    it.each(["midi", "audio"] as const)(
      "carries a looping %s clip's automation across a longer copy, partial last tile included",
      async (kind) => {
        const loop = LOOP_BEATS[kind];
        const length = loop + loop / 2 + 1;
        const start = 440;

        await copyClip(
          { id: await automatedClip(kind, 3) },
          TRACKS[kind],
          111,
          `n${String(length)}/4`,
        );

        await expectLane(
          kind,
          start,
          [
            [0.5, ramp(kind, 0.5)],
            [loop - 0.5, ramp(kind, loop - 0.5)],
            [loop + 0.5, ramp(kind, loop + 0.5)],
            [length - 0.5, ramp(kind, length - 0.5)],
            [length + 1.5, "baseline"],
          ],
          baseline as number,
        );
      },
    );

    describe("the copy's entry", () => {
      it.each(["midi", "audio"] as const)(
        "says it wrote the lane, for a %s clip copied at its own length or another",
        async (kind) => {
          const source = { id: await automatedClip(kind, 4) };
          const own = await copyClip(source, TRACKS[kind], 160);
          const other = await copyClip(source, TRACKS[kind], 162, "n6/4");

          for (const entry of [own, other]) {
            expect(entry.split(LANE_WRITE_NOTE)).toHaveLength(2);
          }
        },
      );

      it("says nothing of the lane for a clip with no automation", async () => {
        const plainClip = { path: `t${String(MIDI_TRACK)}/s1` };

        for (const [bar, length] of [
          [164, undefined],
          [166, "n6/4"],
        ] as const) {
          const entry = await copyClip(plainClip, MIDI_TRACK, bar, length);

          expect(entry).not.toContain(LANE_WRITE_NOTE);
        }
      });
    });

    describe("a scene", () => {
      const sceneCopy = async (
        scene: number,
        bar: number,
        arrangementLength: string,
      ) => {
        await callTool(ctx.client!, "ppal-duplicate", {
          type: "scene",
          path: `s${String(scene)}`,
          toPath: `[${String(bar)}|1]`,
          arrangementLength,
        });
        await sleep(200);
      };

      it("carries every clip's automation across a longer copy", async () => {
        await automatedClip("midi", 6);
        await automatedClip("audio", 6);
        await sceneCopy(6, 121, "n14/4");

        for (const kind of ["midi", "audio"] as const) {
          await expectLane(
            kind,
            480,
            [
              [0.5, ramp(kind, 0.5)],
              [4.5, ramp(kind, 4.5)],
              [9.5, ramp(kind, 9.5)],
              [14.5, "baseline"],
            ],
            baseline as number,
          );
        }
      });

      it("writes only the first part of each clip's automation across a shorter copy", async () => {
        await automatedClip("midi", 7);
        await automatedClip("audio", 7);
        await sceneCopy(7, 141, "n2/4");

        for (const kind of ["midi", "audio"] as const) {
          await expectLane(
            kind,
            560,
            [
              [0.5, ramp(kind, 0.5)],
              [1.5, ramp(kind, 1.5)],
              [3.5, "baseline"],
              [8.5, "baseline"],
            ],
            baseline as number,
          );
        }
      });
    });
  },
);
