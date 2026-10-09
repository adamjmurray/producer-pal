// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// `envelopes` on an arrangement clip: the lines go into a scratch clip,
// which is stamped onto the track's lane over the clip, and the clip is put
// back from a parked copy.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { applyClipEnvelopes } from "#src/tools/clip/envelopes/apply-clip-envelopes.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import {
  CLIP_ID,
  CLIP_START,
  type LaneWorld,
  registerLaneWorld,
} from "./lane-world-test-helpers.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

/** A ramp across the clip's two bars. */
const RAMP = "volume: 1|1 0 / 3|1 1";

/**
 * @param lines - Lines in `envelopes` spelling
 * @returns The lines, as the update-clip call reads them
 */
function linesOf(lines: string[]): Array<{ target: string; notation: string }> {
  return lines.map((line) => {
    const [target, notation] = line.split(/:\s*/);

    return { target: target as string, notation: notation ?? "" };
  });
}

/**
 * The args the write route was called with, less the expiry.
 * @returns One per call
 */
function writes(): unknown[] {
  return vi
    .mocked(requestNode)
    .mock.calls.filter((call) => call[0] === ENVELOPE_ROUTES.write)
    .map(([, args]) => {
      const { expiresInMs: _expiry, ...rest } = args as Record<string, unknown>;

      return rest;
    });
}

describe("applyClipEnvelopes - arrangement clip", () => {
  let world: LaneWorld;

  beforeEach(() => {
    vi.mocked(requestNode).mockReset();
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, result: {} },
    });
    world = registerLaneWorld();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * @param lines - Lines in `envelopes` spelling
   * @param context - The call's context
   * @returns The clip's entry afterwards
   */
  async function apply(
    lines: string[],
    context: Pick<ToolContext, "deadline" | "lanes" | "silenceWavPath"> = {},
  ): Promise<ClipResult> {
    const entry: ClipResult = { id: CLIP_ID, path: "t0[5|1]" };

    await applyClipEnvelopes(entry, linesOf(lines), context);

    return entry;
  }

  it("writes the lane over the clip's span and puts the clip back under a new id", async () => {
    const entry = await apply([RAMP]);

    expect(world.copies.map(({ source, at }) => [source, at])).toStrictEqual([
      // Parked past the end of the Set (32) and the clip (24).
      [CLIP_ID, 36],
      ["carrier1", CLIP_START],
      ["800", CLIP_START],
    ]);
    expect(entry).toStrictEqual({ id: "802", path: "t0[5|1]", envelopes: 1 });
    expect(world.laneIds()).toStrictEqual(["802"]);
    expect(world.deleted).toStrictEqual(["800"]);
  });

  it("writes the lines into a scratch clip as long as the clip, from its start", async () => {
    await apply([RAMP]);

    expect(writes()).toStrictEqual([
      {
        track: "t0",
        slot: 1,
        parameter: "volume",
        points: [
          { time: 0, value: 0 },
          { time: 8, value: 1 },
        ],
      },
    ]);
    expect(world.copies[1]?.source).toBe("carrier1");
  });

  it("spells the times in the clip's own meter", async () => {
    world = registerLaneWorld({
      clip: { signature_numerator: 3, signature_denominator: 4 },
    });

    await apply(["volume: 1|1 0 / 2|1 1"]);

    expect(writes()).toStrictEqual([
      expect.objectContaining({
        points: [
          { time: 0, value: 0 },
          { time: 3, value: 1 },
        ],
      }),
    ]);
  });

  it("writes every line into the one scratch clip and stamps once", async () => {
    const entry = await apply([RAMP, "pan: 1|1 0.5"]);

    expect(writes()).toHaveLength(2);
    expect(world.copies).toHaveLength(3);
    expect(entry.envelopes).toBe(2);
  });

  it("leaves the clips beside it alone", async () => {
    world = registerLaneWorld({
      neighbors: [
        { id: "901", start: 8, end: 16 },
        { id: "902", start: 24, end: 32 },
      ],
    });

    await apply([RAMP]);

    expect(world.laneIds()).toStrictEqual(["901", "802", "902"]);
  });

  it("removes the scene it made for the scratch clip", async () => {
    await apply([RAMP]);

    expect(world.scenesMade).toStrictEqual([1]);
    expect(world.sceneCount()).toBe(1);
    expect(world.scratchClipLeft()).toBe(false);
  });

  it("uses the last scene when it is empty", async () => {
    world = registerLaneWorld({ lastSceneEmpty: true });

    await apply([RAMP]);

    expect(world.scenesMade).toStrictEqual([]);
    expect(world.sceneCount()).toBe(2);
    expect(world.scratchClipLeft()).toBe(false);
  });

  it("parks past the last clip on the track and on its take lanes", async () => {
    world = registerLaneWorld({
      neighbors: [{ id: "901", start: 40, end: 50 }],
    });
    await apply([RAMP]);

    expect(world.copies[0]?.at).toBe(56);

    world = registerLaneWorld({ takeLaneEnd: 100 });
    await apply([RAMP]);

    expect(world.copies[0]?.at).toBe(104);
  });

  it("keeps the call's lane view true", async () => {
    const lanes = new LaneView();

    expect(lanes.clips({ kind: "track", trackIndex: 0 })).toHaveLength(1);

    await apply([RAMP], { lanes });

    expect(
      lanes.clips({ kind: "track", trackIndex: 0 }).map(({ id }) => id),
    ).toStrictEqual(["802"]);
  });

  it("says a point past the clip's end never plays", async () => {
    const entry = await apply(["volume: 1|1 0 / 3|2 1"]);

    expect(entry.detail).toBe(
      'envelope "volume": point 3|2 is past the clip end (3|1), so it never plays',
    );
    expect(entry.envelopes).toBe(1);
    expect(world.copies).toHaveLength(3);
  });

  it("refuses an empty line, since a lane can't be cleared, and still writes the others", async () => {
    const entry = await apply(["pan:", RAMP]);

    expect(entry.detail).toBe(
      'envelope "pan": not cleared: an arrangement lane can\'t be cleared; write a flat line instead',
    );
    expect(entry.envelopes).toBe(1);
    expect(writes()).toHaveLength(1);
    expect(world.copies).toHaveLength(3);
  });

  it("changes nothing when no line could be written", async () => {
    const entry = await apply(["pan:"]);

    expect(entry).toStrictEqual({
      id: CLIP_ID,
      path: "t0[5|1]",
      envelopes: 0,
      detail:
        'envelope "pan": not cleared: an arrangement lane can\'t be cleared; write a flat line instead; the clip and its lane are unchanged',
    });
    expect(world.copies).toStrictEqual([]);
    expect(world.scratchClipLeft()).toBe(false);
    expect(world.sceneCount()).toBe(1);
  });

  it("changes nothing when the remote script refuses every line", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, error: "value 5 is outside 0..1" },
    });

    const entry = await apply([RAMP]);

    expect(entry.envelopes).toBe(0);
    expect(entry.detail).toBe(
      'envelope "volume": value 5 is outside 0..1; the clip and its lane are unchanged',
    );
    expect(world.copies).toStrictEqual([]);
  });

  it("says when the remote script isn't running, and changes nothing", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    const entry = await apply([RAMP]);

    expect(entry.envelopes).toContain("isn't running");
    expect(world.copies).toStrictEqual([]);
    expect(world.scratchClipLeft()).toBe(false);
  });

  it("refuses two lines for one parameter", async () => {
    const entry = await apply([RAMP, "volume: 1|1 1"]);

    expect(entry.envelopes).toContain("are the same parameter");
    expect(world.copies).toStrictEqual([]);
  });

  it("refuses points on a Live that can't write them", async () => {
    registerMockObject("live_app", {
      path: "live_app",
      methods: { get_version_string: () => "12.3.8" },
    });

    const entry = await apply([RAMP]);

    expect(entry.detail).toContain("requires Live 12.4 or later");
    expect(world.copies).toStrictEqual([]);
  });

  it("stops at a line that stalls, and says it may or may not be in the lane", async () => {
    vi.mocked(requestNode)
      .mockResolvedValueOnce({
        success: true,
        result: { available: true, result: {} },
      })
      .mockResolvedValueOnce({
        success: false,
        error: "node_request 'x' timed out after 45000ms",
      });

    const entry = await apply([RAMP, "pan: 1|1 0.5", "send0: 1|1 0.5"]);

    expect(entry.envelopes).toBe(1);
    expect(entry.detail).toBe(
      'envelope "pan": the Producer Pal remote script did not answer in time; its points may or may not be in the lane; envelopes not written, since the next would wait the same way: "send0"',
    );
    expect(world.copies).toHaveLength(3);
  });

  it("stops before parking when the request has run out of time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
    vi.mocked(requestNode).mockImplementation(async () => {
      vi.setSystemTime(2_000_000);

      return { success: true, result: { available: true, result: {} } };
    });

    const entry = await apply([RAMP], { deadline: 1_100_000 });

    expect(entry).toStrictEqual({
      id: CLIP_ID,
      path: "t0[5|1]",
      envelopes: 0,
      detail:
        "not written to the lane: the request ran out of time; re-run for this clip; the clip and its lane are unchanged",
    });
    expect(world.copies).toStrictEqual([]);
    expect(world.scratchClipLeft()).toBe(false);
    expect(world.sceneCount()).toBe(1);
  });

  it("changes nothing when Live makes no scratch clip", async () => {
    world = registerLaneWorld({ noScratchClip: true });

    const entry = await apply([RAMP]);

    expect(entry).toStrictEqual({
      id: CLIP_ID,
      path: "t0[5|1]",
      envelopes: 0,
      detail:
        "not written to the lane: Live made no scratch clip; the clip and its lane are unchanged",
    });
    expect(world.copies).toStrictEqual([]);
    expect(world.sceneCount()).toBe(1);
  });

  it("writes an audio clip's lane through a warped silent clip, whatever the clip's own warping", async () => {
    world = registerLaneWorld({ audio: true });

    const entry = await apply([RAMP], { silenceWavPath: "/silence.wav" });
    const carrier = world.audioScratch;

    expect(carrier?.set).toHaveBeenCalledWith("warping", 1);
    expect(carrier?.set).toHaveBeenCalledWith("looping", 1);
    expect(carrier?.set).toHaveBeenCalledWith("loop_end", 8);
    expect(writes()).toHaveLength(1);
    expect(world.copies.map(({ source, at }) => [source, at])).toStrictEqual([
      [CLIP_ID, 36],
      ["carrier1", CLIP_START],
      ["800", CLIP_START],
    ]);
    expect(entry).toStrictEqual({ id: "802", path: "t0[5|1]", envelopes: 1 });
    expect(world.scratchClipLeft()).toBe(false);
    expect(world.sceneCount()).toBe(1);
  });

  it("refuses an audio clip when the silence file isn't known", async () => {
    world = registerLaneWorld({ audio: true });

    const entry = await apply([RAMP]);

    expect(entry.envelopes).toBe(
      "not written: an audio clip's lane is written through a silent audio clip, and the silence file isn't available",
    );
    expect(world.copies).toStrictEqual([]);
  });

  it("changes nothing when there is no scene to hold a scratch clip", async () => {
    world = registerLaneWorld({ noScenes: true });

    const entry = await apply([RAMP]);

    expect(entry.envelopes).toBe(0);
    expect(entry.detail).toMatch(
      /^not written to the lane: .*; the clip and its lane are unchanged$/,
    );
    expect(world.copies).toStrictEqual([]);
  });

  it("refuses a clip on a take lane", async () => {
    registerMockObject(CLIP_ID, {
      path: `${livePath.track(0)} take_lanes 0 arrangement_clips 0`,
      type: "Clip",
      properties: { is_arrangement_clip: 1, is_audio_clip: 0 },
    });

    const entry = await apply([RAMP]);

    expect(entry.envelopes).toBe(
      "only a clip on a track's main arrangement lane can take envelopes; move it there first",
    );
    expect(world.copies).toStrictEqual([]);
  });

  it("refuses a frozen track", async () => {
    world = registerLaneWorld({ frozen: true });

    const entry = await apply([RAMP]);

    expect(entry.envelopes).toBe(
      "not written: track t0 (id track0) is frozen; unfreeze it first",
    );
    expect(world.copies).toStrictEqual([]);
  });
});
