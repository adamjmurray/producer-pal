// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A take lane promoted onto a track's main lane: its clips are re-created
// there, at the positions they already had, over what sat on them.

import { beforeEach, describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import {
  duplicateToLanes,
  type LaneCopyEntry,
  registerLaneSource,
  registerLiveSet,
  registerMainLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";

/** What a promote leaves behind, said once on the track's own entry. */
const CLIPS_ONLY =
  "clips only: the main lane takes no devices, routing, mixer settings or session clips";

describe("duplicate take lane to a main lane", () => {
  beforeEach(() => {
    clearCapturedWarnings();
  });

  it("promotes a lane onto its own track's main lane", async () => {
    registerLiveSet();

    const track = registerTakeLaneTrack({
      trackIndex: 0,
      initialLanes: 1,
      initialLaneClips: [[{ start: 8, end: 12 }]],
    });

    const result = await duplicateToLanes<LaneCopyEntry>({
      path: "t0/l0",
      toPath: "t0",
    });

    expect(result.path).toBe("t0");
    // Nothing is created: the main lane is the track itself.
    expect(result).not.toHaveProperty("created");
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 4);
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(result.clips.map((clip) => clip.path)).toStrictEqual(["t0[3|1]"]);
    expect(result.detail).toBe(CLIPS_ONLY);
  });

  it("promotes a lane onto another track, keeping every position", async () => {
    registerLaneSource([8, 24]);

    const destination = registerTakeLaneTrack({ trackIndex: 1 });
    const result = await duplicateToLanes<LaneCopyEntry>({
      path: "t0/l0",
      toPath: "t1",
    });

    expect(result.path).toBe("t1");
    expect(result.clips.map((clip) => clip.path)).toStrictEqual([
      "t1[3|1]",
      "t1[7|1]",
    ]);
    // A promote makes no lane on the way.
    expect(destination.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  it("promotes the lane an id names", async () => {
    const laneId = registerLaneSource([16]);

    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await duplicateToLanes<LaneCopyEntry>({
      id: laneId,
      toPath: "t1",
    });

    expect(result.path).toBe("t1");
    expect(result.clips.map((clip) => clip.path)).toStrictEqual(["t1[5|1]"]);
  });

  it("pairs each source with its own destination, lane or track", async () => {
    registerLiveSet();
    registerTakeLaneTrack({
      trackIndex: 0,
      initialLanes: 2,
      initialLaneClips: [[{ start: 0, end: 4 }], [{ start: 8, end: 12 }]],
    });
    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await duplicateToLanes<LaneCopyEntry[]>({
      path: "t0/l0,t0/l1",
      toPath: "t1,t1/l0",
    });

    expect(result.map((entry) => entry.path)).toStrictEqual(["t1", "t1/l0"]);
    expect(result[0]?.clips.map((clip) => clip.path)).toStrictEqual([
      "t1[1|1]",
    ]);
    expect(result[1]?.created).toBe(true);
    expect(result[1]?.clips.map((clip) => clip.path)).toStrictEqual([
      "t1/l0[3|1]",
    ]);
  });

  it("refuses a destination track of the other type", async () => {
    registerLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1, hasMidiInput: 0 });

    await expect(
      duplicateToLanes({ path: "t0/l0", toPath: "t1" }),
    ).rejects.toThrow(
      "track t1 (id tl_track_1) is audio; a MIDI clip needs a MIDI track",
    );
  });

  it("promotes an audio lane onto an audio track", async () => {
    registerLaneSource(
      [8],
      { has_midi_input: 0 },
      { is_midi_clip: 0, warping: 1, file_path: "kick.wav" },
    );
    registerTakeLaneTrack({ trackIndex: 1, hasMidiInput: 0 });

    const result = await duplicateToLanes<LaneCopyEntry>({
      path: "t0/l0",
      toPath: "t1",
    });

    expect(result.clips.map((clip) => clip.path)).toStrictEqual(["t1[3|1]"]);
    // An audio copy is rebuilt from the sample, which costs its warp markers.
    expect(result.detail).toContain("warp markers reset");
  });

  it("marks the copy a second destination landed on top of", async () => {
    registerLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await duplicateToLanes<LaneCopyEntry[]>({
      path: "t0/l0",
      toPath: "t1,t1",
    });

    // Both entries name t1, so the second create cleared the first's clip.
    expect(result[0]?.clips).toStrictEqual([
      { path: "t1[1|1]", overwritten: true },
    ]);
    expect(result[1]?.clips[0]).toHaveProperty("id");
  });

  it("warns that takeLaneName names no lane a promote makes", async () => {
    registerLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    await duplicateToLanes({
      path: "t0/l0",
      toPath: "t1",
      takeLaneName: "Comp",
    });

    expect(capturedWarnings().join("\n")).toContain("takeLaneName ignored");
  });

  it("refuses a group track, which holds no clips of its own", async () => {
    registerLaneSource([0]);
    // A MIDI group passes the type check, and every create on it then fails.
    registerMockObject("group_track", {
      path: livePath.track(1),
      properties: { has_midi_input: 1, is_foldable: 1 },
    });

    await expect(
      duplicateToLanes({ path: "t0/l0", toPath: "t1" }),
    ).rejects.toThrow(
      'toPath "t1" is a group track, which holds no arrangement clips',
    );
  });

  it("refuses a lane with nothing on it", async () => {
    registerLaneSource([]);
    registerTakeLaneTrack({ trackIndex: 1 });

    await expect(
      duplicateToLanes({ path: "t0/l0", toPath: "t1" }),
    ).rejects.toThrow("t0/l0 has no arrangement clips to copy");
  });

  it("refuses a position beside a track destination", async () => {
    registerLaneSource([0]);

    const destination = registerTakeLaneTrack({ trackIndex: 1 });

    await expect(
      duplicateToLanes({ path: "t0/l0", toPath: "t1[5|1]" }),
    ).rejects.toThrow(
      'toPath "t1[5|1]" names a position, but a track copy keeps each ' +
        'clip\'s own; name the track alone, as "t1"',
    );
    expect(destination.call).not.toHaveBeenCalled();
  });

  it("leaves a positioned toPath alone for a track source", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    // Only a lane source can promote, so the position is the new-track copy's
    // to ignore rather than a destination this copier refuses.
    const result = await duplicateToLanes<Record<string, unknown>>({
      id: "src_track",
      toPath: "t1[5|1]",
    });

    expect(result.detail).toBe(
      'toPath "t1[5|1]" not honored; a track copy lands right after its source, or after a group\'s last member',
    );
  });

  it("leaves a main-lane source with a bare toPath a new-track copy", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await duplicateToLanes<Record<string, unknown>>({
      id: "src_track",
      toPath: "t1",
    });

    // A track source still makes a track, and says the destination went
    // unused; a promote would have answered with the "clips only" reason.
    expect(result.detail).toBe(
      'toPath "t1" not honored; a track copy lands right after its source, or after a group\'s last member',
    );
  });
});
