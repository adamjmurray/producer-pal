// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readOneTrack, readTrack } from "../read-track.ts";

interface TakeLane {
  id: string;
  path: string;
  name: string;
  clips: Array<Record<string, unknown>>;
}

/**
 * Register a MIDI track (index 2) with a main arrangement clip and two
 * non-main take lanes ("Take A" with one clip, "Take B" with two clips).
 * @param trackOverrides - Extra track property overrides
 */
function registerTrackWithTakeLanes(
  trackOverrides: Record<string, unknown> = {},
): void {
  registerMockObject("track3", {
    path: livePath.track(2),
    type: "Track",
    properties: {
      has_midi_input: 1,
      name: "Track with Take Lanes",
      clip_slots: [],
      arrangement_clips: children("main_clip"),
      take_lanes: children("lane1", "lane2"),
      devices: [],
      ...trackOverrides,
    },
  });
  registerArrangementClip("main_clip", livePath.track(2).arrangementClip(0));
  registerMockObject("lane1", {
    path: String(livePath.track(2).takeLane(0)),
    type: "TakeLane",
    properties: { name: "Take A", arrangement_clips: children("clip_a") },
  });
  registerMockObject("lane2", {
    path: String(livePath.track(2).takeLane(1)),
    type: "TakeLane",
    properties: {
      name: "Take B",
      arrangement_clips: children("clip_b1", "clip_b2"),
    },
  });
  registerArrangementClip("clip_a", livePath.track(2).takeLane(0).arrangementClip(0)); // prettier-ignore
  registerArrangementClip("clip_b1", livePath.track(2).takeLane(1).arrangementClip(0)); // prettier-ignore
  registerArrangementClip("clip_b2", livePath.track(2).takeLane(1).arrangementClip(1)); // prettier-ignore
  registerMockObject("live-set", {
    path: "live_set",
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
}

/**
 * Register a minimal two-bar MIDI arrangement clip mock.
 * @param id - Mock object ID
 * @param path - Canonical Live API path for the clip
 */
function registerArrangementClip(id: string, path: PathLike) {
  registerMockObject(id, {
    path: String(path),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      name: id,
      start_time: 0,
      end_time: 8,
    },
  });
}

describe("readOneTrack take lanes", () => {
  it("returns takeLaneCount in overview when arrangement-clips not included", () => {
    registerTrackWithTakeLanes();

    const result = readOneTrack({ trackIndex: 2 });

    expect(result.takeLaneCount).toBe(2);
    expect(result).not.toHaveProperty("takeLanes");
  });

  it("returns the full takeLanes list when arrangement-clips is included", () => {
    registerTrackWithTakeLanes();

    const result = readOneTrack({
      trackIndex: 2,
      include: ["arrangement-clips"],
    });

    expect(result).not.toHaveProperty("takeLaneCount");

    const takeLanes = result.takeLanes as TakeLane[];

    expect(takeLanes).toHaveLength(2);
    expect(takeLanes[0]!.id).toBe("lane1");
    expect(takeLanes[0]!.path).toBe("t2/l0");
    expect(takeLanes[0]!.name).toBe("Take A");
    expect(takeLanes[0]!.clips.map((c) => c.id)).toStrictEqual(["clip_a"]);
    expect(takeLanes[1]!.id).toBe("lane2");
    expect(takeLanes[1]!.path).toBe("t2/l1");
    expect(takeLanes[1]!.name).toBe("Take B");
    expect(takeLanes[1]!.clips.map((c) => c.id)).toStrictEqual([
      "clip_b1",
      "clip_b2",
    ]);
  });

  it("reports an all-digit take lane name as a string", () => {
    registerTrackWithTakeLanes();
    registerMockObject("lane1", {
      path: String(livePath.track(2).takeLane(0)),
      type: "TakeLane",
      properties: { name: 5678, arrangement_clips: children("clip_a") },
    });

    const result = readOneTrack({
      trackIndex: 2,
      include: ["arrangement-clips"],
    });
    const takeLanes = result.takeLanes as TakeLane[];

    expect(takeLanes[0]!.name).toBe("5678");
  });

  it("strips fields redundant with the parent track from take lane clips", () => {
    registerTrackWithTakeLanes();

    const result = readOneTrack({
      trackIndex: 2,
      include: ["arrangement-clips"],
    });
    const clip = (result.takeLanes as TakeLane[])[0]!.clips[0]!;

    expect(clip.id).toBe("clip_a");
    expect(clip).not.toHaveProperty("view");
    expect(clip).not.toHaveProperty("type");
    expect(clip).not.toHaveProperty("trackIndex");
    // The path stays: it says where on the lane the clip starts, which the
    // lane's own path doesn't. start_time 0 in 4/4 is bar 1 beat 1.
    expect(clip.path).toBe("t2/l0[1|1]");
  });

  it("omits the field entirely when the track has no take lanes", () => {
    registerMockObject("track3", {
      path: livePath.track(2),
      type: "Track",
      properties: {
        has_midi_input: 1,
        name: "No Take Lanes",
        clip_slots: [],
        arrangement_clips: [],
        devices: [],
      },
    });

    const overview = readOneTrack({ trackIndex: 2 });

    expect(overview).not.toHaveProperty("takeLaneCount");
    expect(overview).not.toHaveProperty("takeLanes");

    const detailed = readOneTrack({
      trackIndex: 2,
      include: ["arrangement-clips"],
    });

    expect(detailed).not.toHaveProperty("takeLanes");
  });

  it("omits take lanes for group tracks", () => {
    registerTrackWithTakeLanes({ is_foldable: 1 });

    const result = readOneTrack({ trackIndex: 2 });

    expect(result.isGroup).toBe(true);
    expect(result).not.toHaveProperty("takeLaneCount");
    expect(result).not.toHaveProperty("takeLanes");
  });

  it("omits take lanes for return tracks", () => {
    registerMockObject("return1", {
      path: livePath.returnTrack(0),
      type: "Track",
      properties: {
        has_midi_input: 0,
        name: "Return A",
        take_lanes: children("lane1", "lane2"),
        devices: [],
      },
    });

    const result = readOneTrack({ trackType: "return", trackIndex: 0 });

    expect(result).not.toHaveProperty("takeLaneCount");
    expect(result).not.toHaveProperty("takeLanes");
  });
});

describe("readTrack on a take lane target", () => {
  it("reads the lane itself, with no clips until they are asked for", () => {
    registerTrackWithTakeLanes();

    expect(readOneTrack({ path: "t2/l0" })).toStrictEqual({
      id: "lane1",
      path: "t2/l0",
      name: "Take A",
    });
  });

  it("reads the lane's clips with the arrangement-clips include", () => {
    registerTrackWithTakeLanes();

    const result = readOneTrack({
      path: "t2/l1",
      include: ["arrangement-clips"],
    });

    expect(result.id).toBe("lane2");

    const clips = result.clips as Array<{ id: string; arrangementLength: string }>; // prettier-ignore

    expect(clips.map((c) => c.id)).toStrictEqual(["clip_b1", "clip_b2"]);
    // A lane clip reports its span too, without the timing include.
    expect(clips.map((c) => c.arrangementLength)).toStrictEqual([
      "2bar",
      "2bar",
    ]);
  });

  it("mixes lane paths with track paths, one entry each", () => {
    registerTrackWithTakeLanes();

    const result = readTrack({ path: "t2,t2/l1" }) as Array<
      Record<string, unknown>
    >;

    expect(result[0]!.id).toBe("track3");
    expect(result[1]).toStrictEqual({
      id: "lane2",
      path: "t2/l1",
      name: "Take B",
    });
  });

  it("reads the lane an id names, the same as its path does", () => {
    registerTrackWithTakeLanes();

    const byPath = readOneTrack({ path: "t2/l0" });
    const byId = readOneTrack({ id: "lane1" });

    expect(byId).toStrictEqual(byPath);
    expect(byId).toStrictEqual({ id: "lane1", path: "t2/l0", name: "Take A" });
  });

  it("reads a lane id's clips with the arrangement-clips include", () => {
    registerTrackWithTakeLanes();

    const result = readOneTrack({
      id: "lane2",
      include: ["arrangement-clips"],
    });

    expect(result).toStrictEqual(
      readOneTrack({ path: "t2/l1", include: ["arrangement-clips"] }),
    );
    expect((result.clips as Array<{ id: string }>).map((c) => c.id)) //
      .toStrictEqual(["clip_b1", "clip_b2"]);
  });

  it("reads a lane id under the legacy trackId spelling", () => {
    registerTrackWithTakeLanes();

    expect(readOneTrack({ trackId: "lane1" })).toStrictEqual({
      id: "lane1",
      path: "t2/l0",
      name: "Take A",
    });
  });

  it("mixes a lane id with track and lane paths, one entry each", () => {
    registerTrackWithTakeLanes();

    const result = readTrack({ id: "lane2", path: "t2,t2/l0" }) as Array<
      Record<string, unknown>
    >;

    expect(result[0]).toStrictEqual({
      id: "lane2",
      path: "t2/l1",
      name: "Take B",
    });
    expect(result[1]!.id).toBe("track3");
    expect(result[2]).toStrictEqual({
      id: "lane1",
      path: "t2/l0",
      name: "Take A",
    });
  });

  it("keeps the slot of a lane, track, or spelling it can't read", () => {
    mockNonExistentObjects();
    registerTrackWithTakeLanes();
    registerMockObject("group", {
      path: livePath.track(3),
      type: "Track",
      properties: { is_foldable: 1 },
    });

    const result = readTrack({ path: "t2/l5,t9/l0,t3/l0,t2/l+" }) as Array<
      Record<string, unknown>
    >;

    expect(result).toStrictEqual([
      { path: "t2/l5", ok: false, reason: 'nothing at path "t2/l5"' },
      { path: "t9/l0", ok: false, reason: 'nothing at path "t9/l0"' },
      {
        path: "t3/l0",
        ok: false,
        reason: 'only regular tracks have take lanes; "t3" is a group track',
      },
      {
        path: "t2/l+",
        ok: false,
        reason:
          'invalid path "t2/l+" - "l+" adds a take lane, which only ppal-update-track does; read an existing lane as "t<track>/l<lane>"',
      },
    ]);
  });

  // A lane path beside a track index names two targets; the track read's own
  // refusal has to win.
  it("refuses a lane path sent with a track index", () => {
    registerTrackWithTakeLanes();

    expect(() => readOneTrack({ path: "t2/l0", trackIndex: 1 })).toThrow(
      "path names the track on its own",
    );
  });

  it("throws for a lone lane it can't read", () => {
    mockNonExistentObjects();
    registerTrackWithTakeLanes();

    expect(() => readOneTrack({ path: "t2/l5" })).toThrow(
      'nothing at path "t2/l5"',
    );
  });
});
