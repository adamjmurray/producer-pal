// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A track source with a take-lane destination: its main-lane clips are
// re-created on the lane, at the positions they already had.

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { MAX_TAKE_LANES } from "#src/tools/constants.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import {
  CLIPS_ONLY,
  duplicateToLanes,
  type LaneCopyEntry,
  registerMainLaneClip,
  registerMainLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";

/**
 * Copy the source track onto the lanes a toPath names.
 * @param args - The duplicate args beyond the track source
 * @returns The result, as the caller expects it
 */
async function copyToLanes<T>(args: Record<string, unknown>): Promise<T> {
  return await duplicateToLanes<T>({ id: "src_track", ...args });
}

describe("duplicate track to take lane", () => {
  beforeEach(() => {
    clearCapturedWarnings();
  });

  it("copies every main-lane clip onto a new lane, at the same positions", async () => {
    registerMainLaneSource([0, 16]);

    const destination = registerTakeLaneTrack({ trackIndex: 1 });
    const result = await copyToLanes<LaneCopyEntry>({
      toPath: "t1/l0",
    });

    expect(destination.call).toHaveBeenCalledWith("create_take_lane");
    expect(result.path).toBe("t1/l0");
    expect(result.created).toBe(true);
    expect(result.clips.map((clip) => clip.path)).toStrictEqual([
      "t1/l0[1|1]",
      "t1/l0[5|1]",
    ]);
    // Copying a track onto a lane leaves everything but the clips behind, and
    // this source loses nothing else.
    expect(result.detail).toBe(CLIPS_ONLY);
  });

  it("names the copies and reports what re-creating them lost", async () => {
    registerMainLaneSource([0], {}, { has_envelopes: 1 });
    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await copyToLanes<LaneCopyEntry>({
      toPath: "t1/l0",
      name: "Take B",
    });

    expect(result.detail).toBe(
      `${CLIPS_ONLY}; automation envelopes aren't copied`,
    );

    const copy = registerMockObject(result.clips[0]?.id as string, {});

    expect(copy.set).toHaveBeenCalledWith("name", "Take B");
  });

  it("appends a lane per l+ and names the one takeLaneName asks for", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await copyToLanes<LaneCopyEntry[]>({
      toPath: "t1/l+,t1/l+",
      takeLaneName: "Take B",
    });

    expect(result.map((entry) => entry.path)).toStrictEqual(["t1/l0", "t1/l1"]);
    // A lane this call made and named says what it is called.
    expect(result.map((entry) => entry.name)).toStrictEqual([
      "Take B",
      "Take B",
    ]);

    // takeLaneName still names a lane this call creates, so it isn't reported
    // as ignored the way it is for a copy that lands nowhere near a lane.
    expect(capturedWarnings().join("\n")).not.toContain("takeLaneName ignored");
  });

  it("leaves the clips on a lane out of what it reads off the main lane", async () => {
    registerMainLaneSource([0]);

    // Guards the unsettled part of Live's answer: were a lane's clips to show
    // up in the track's arrangement_clips, they would be copied too.
    const laneClip = registerMockObject("lane_clip", {
      path: livePath.track(0).takeLane(0).arrangementClip(0),
      type: "Clip",
      properties: { is_midi_clip: 1, is_arrangement_clip: 1, start_time: 16 },
    });

    registerMockObject("src_track", {
      properties: { arrangement_clips: children("src_clip_0", laneClip.id) },
    });
    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await copyToLanes<LaneCopyEntry>({ toPath: "t1/l0" });

    expect(result.clips.map((clip) => clip.path)).toStrictEqual(["t1/l0[1|1]"]);
  });

  it("fills in the lanes up to the index named, and reuses an existing one", async () => {
    registerMainLaneSource([0]);

    const destination = registerTakeLaneTrack({ trackIndex: 1 });

    await copyToLanes({ toPath: "t1/l1" });

    expect(destination.call).toHaveBeenCalledTimes(2);

    const again = await copyToLanes<LaneCopyEntry>({
      toPath: "t1/l1",
    });

    expect(again.path).toBe("t1/l1");
    expect(again).not.toHaveProperty("created");
  });

  it("warns for the params a lane copy can't use", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    await copyToLanes({
      toPath: "t1/l0",
      count: 2,
      withoutClips: true,
      withoutDevices: true,
    });

    expect(capturedWarnings().join("\n")).toContain(
      "count 2 ignored: a track's clips go once to each lane toPath names",
    );
    expect(capturedWarnings().join("\n")).toContain(
      `withoutClips/withoutDevices ignored: ${CLIPS_ONLY}`,
    );
  });

  it("warns that routeToSource has nothing to route", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    await copyToLanes({
      toPath: "t1/l0",
      routeToSource: true,
    });

    expect(capturedWarnings().join("\n")).toContain(
      `routeToSource ignored: ${CLIPS_ONLY}`,
    );
  });

  it("copies an audio clip, and skips one whose sample is gone", async () => {
    registerMainLaneSource(
      [0, 16],
      { has_midi_input: 0 },
      { is_midi_clip: 0, warping: 1 },
    );
    // Only the first clip still has its sample, so only it can be re-created.
    registerMainLaneClip(0, 0, {
      is_midi_clip: 0,
      warping: 1,
      file_path: "kick.wav",
    });
    registerTakeLaneTrack({ trackIndex: 1, hasMidiInput: 0 });

    const result = await copyToLanes<LaneCopyEntry>({
      toPath: "t1/l0",
    });

    expect(result.clips[0]?.path).toBe("t1/l0[1|1]");
    // The entry names where the copy was headed, not where it came from.
    expect(result.clips[1]).toStrictEqual({
      path: "t1/l0[5|1]",
      ok: false,
      detail:
        "a lane copy is re-created from the sample, and this audio clip has none",
    });
    expect(result.detail).toContain("warp markers reset");
  });

  it("copies onto an existing lane past the cap", async () => {
    registerMainLaneSource([0]);

    const destination = registerTakeLaneTrack({
      trackIndex: 1,
      initialLanes: MAX_TAKE_LANES + 1,
    });

    const result = await copyToLanes<LaneCopyEntry>({
      toPath: `t1/l${MAX_TAKE_LANES}`,
    });

    expect(result.path).toBe(`t1/l${MAX_TAKE_LANES}`);
    expect(result.clips.map((clip) => clip.path)).toStrictEqual([
      `t1/l${MAX_TAKE_LANES}[1|1]`,
    ]);
    expect(destination.call).not.toHaveBeenCalledWith("create_take_lane");
  });
});

describe("duplicate track to take lane - destinations it can't use", () => {
  beforeEach(() => {
    clearCapturedWarnings();
  });

  it("reports a MIDI/audio mismatch on that destination's own entry", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });
    registerTakeLaneTrack({ trackIndex: 2, hasMidiInput: 0 });

    const result = await copyToLanes<LaneCopyEntry[]>({
      toPath: "t1/l0,t2/l0",
    });

    expect(result[0]?.path).toBe("t1/l0");
    expect(result[1]).toStrictEqual({
      path: "t2/l0",
      ok: false,
      detail:
        "track t2 (id tl_track_2) is audio; a MIDI clip needs a MIDI track",
    });
  });

  it("throws the reason when the mismatched lane is the only destination", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1, hasMidiInput: 0 });

    await expect(copyToLanes({ toPath: "t1/l0" })).rejects.toThrow(
      "track t1 (id tl_track_1) is audio",
    );
  });

  it("refuses a track that has no lanes, and one that isn't there", async () => {
    mockNonExistentObjects();
    registerMainLaneSource([0]);
    registerMockObject("group_track", {
      path: livePath.track(1),
      properties: { has_midi_input: 1, is_foldable: 1 },
    });

    const result = await copyToLanes<LaneCopyEntry[]>({
      toPath: "t1/l0,t9/l0",
    });

    expect(result[0]).toStrictEqual({
      path: "t1/l0",
      ok: false,
      detail: 'only regular tracks have take lanes; "t1" is a group track',
    });
    expect(result[1]).toStrictEqual({
      path: "t9/l0",
      ok: false,
      detail: "track t9 does not exist",
    });
  });

  it("refuses a destination that names no lane at all", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    // "zz9" doesn't parse at all, and still gets its own entry.
    const result = await copyToLanes<LaneCopyEntry[]>({
      toPath: "t1/l0,t2,zz9",
    });

    expect(result.slice(1)).toStrictEqual([
      {
        path: "t2",
        ok: false,
        detail:
          'toPath "t2" names no take lane; a track\'s clips copy onto one, as "t2/l0" or "t2/l+"',
      },
      {
        path: "zz9",
        ok: false,
        detail:
          'toPath "zz9" names no take lane; a track\'s clips copy onto one, as "t2/l0" or "t2/l+"',
      },
    ]);
  });

  it("creates no lane at all when one destination is past the cap", async () => {
    registerMainLaneSource([0]);

    const destination = registerTakeLaneTrack({ trackIndex: 1 });

    const result = await copyToLanes<LaneCopyEntry[]>({
      toPath: `t1/l0,t1/l${MAX_TAKE_LANES}`,
    });

    expect(result[0]?.path).toBe("t1/l0");
    expect(result[1]).toStrictEqual({
      path: `t1/l${MAX_TAKE_LANES}`,
      ok: false,
      detail: `take lane "l${MAX_TAKE_LANES}" is out of range: Producer Pal creates take lanes only up to "l${MAX_TAKE_LANES - 1}"`,
    });
    // Only the lane that fit was made: the cap is checked before any of them.
    expect(destination.call).toHaveBeenCalledTimes(1);
  });

  it("refuses a lane destination that carries a position", async () => {
    registerMainLaneSource([0]);

    const destination = registerTakeLaneTrack({ trackIndex: 1 });

    await expect(copyToLanes({ toPath: "t1/l0[5|1]" })).rejects.toThrow(
      'toPath "t1/l0[5|1]" names a position, but a track copy keeps each ' +
        'clip\'s own; name the lane alone, as "t1/l0"',
    );
    expect(destination.call).not.toHaveBeenCalled();
  });

  it("refuses arrangementStart beside a lane destination", async () => {
    registerMainLaneSource([0]);

    const destination = registerTakeLaneTrack({ trackIndex: 1 });

    await expect(
      copyToLanes({ toPath: "t1/l0", arrangementStart: "5|1" }),
    ).rejects.toThrow(
      "arrangementStart doesn't apply to a lane copy: every clip keeps its own position; drop it",
    );
    expect(destination.call).not.toHaveBeenCalled();
  });

  it("refuses a source with nothing on its main lane", async () => {
    registerMainLaneSource([]);
    registerTakeLaneTrack({ trackIndex: 1 });

    await expect(copyToLanes({ toPath: "t1/l0" })).rejects.toThrow(
      "t0 (id src_track) has no arrangement clips on its main lane to copy",
    );
  });

  it("makes no lane when nothing on the source can be re-created", async () => {
    registerMainLaneSource([0], { has_midi_input: 0 }, { is_midi_clip: 0 });

    const destination = registerTakeLaneTrack({
      trackIndex: 1,
      hasMidiInput: 0,
    });

    await expect(copyToLanes({ toPath: "t1/l0" })).rejects.toThrow(
      "t0 (id src_track) has no clip a lane copy can re-create",
    );
    // A lane can't be deleted, so an empty one must never be left behind.
    expect(destination.call).not.toHaveBeenCalled();
  });

  it("reports a clip the lane created but couldn't fill", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1, postCreateFails: true });

    const result = await copyToLanes<LaneCopyEntry>({
      toPath: "t1/l0",
    });

    expect(result.clips[0]?.path).toBe("t1/l0[1|1]");
    expect(result.clips[0]?.detail).toBe(
      "the take-lane copy is incomplete (notes failed)",
    );
  });

  it("reports a clip Live never created", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1, clipCreationFails: true });

    const result = await copyToLanes<LaneCopyEntry>({
      toPath: "t1/l0",
    });

    expect(result.clips[0]?.ok).toBe(false);
    expect(result.clips[0]?.detail).toContain("the take-lane copy failed");
  });
});
