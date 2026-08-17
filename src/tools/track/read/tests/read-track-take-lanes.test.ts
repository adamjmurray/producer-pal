// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { readTrack } from "../read-track.ts";

interface TakeLane {
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
}

/**
 * Register a minimal MIDI arrangement clip mock.
 * @param id - Mock object ID
 * @param path - Canonical Live API path for the clip
 */
function registerArrangementClip(id: string, path: PathLike) {
  registerMockObject(id, {
    path: String(path),
    type: "Clip",
    properties: { is_arrangement_clip: 1, is_midi_clip: 1, name: id },
  });
}

describe("readTrack take lanes", () => {
  it("returns takeLaneCount in overview when arrangement-clips not included", () => {
    registerTrackWithTakeLanes();

    const result = readTrack({ trackIndex: 2 });

    expect(result.takeLaneCount).toBe(2);
    expect(result).not.toHaveProperty("takeLanes");
  });

  it("returns the full takeLanes list when arrangement-clips is included", () => {
    registerTrackWithTakeLanes();

    const result = readTrack({ trackIndex: 2, include: ["arrangement-clips"] });

    expect(result).not.toHaveProperty("takeLaneCount");

    const takeLanes = result.takeLanes as TakeLane[];

    expect(takeLanes).toHaveLength(2);
    expect(takeLanes[0]!.path).toBe("t2/l0");
    expect(takeLanes[0]!.name).toBe("Take A");
    expect(takeLanes[0]!.clips.map((c) => c.id)).toStrictEqual(["clip_a"]);
    expect(takeLanes[1]!.path).toBe("t2/l1");
    expect(takeLanes[1]!.name).toBe("Take B");
    expect(takeLanes[1]!.clips.map((c) => c.id)).toStrictEqual([
      "clip_b1",
      "clip_b2",
    ]);
  });

  it("strips fields redundant with the parent track from take lane clips", () => {
    registerTrackWithTakeLanes();

    const result = readTrack({ trackIndex: 2, include: ["arrangement-clips"] });
    const clip = (result.takeLanes as TakeLane[])[0]!.clips[0]!;

    expect(clip.id).toBe("clip_a");
    expect(clip).not.toHaveProperty("view");
    expect(clip).not.toHaveProperty("type");
    expect(clip).not.toHaveProperty("trackIndex");
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

    const overview = readTrack({ trackIndex: 2 });

    expect(overview).not.toHaveProperty("takeLaneCount");
    expect(overview).not.toHaveProperty("takeLanes");

    const detailed = readTrack({
      trackIndex: 2,
      include: ["arrangement-clips"],
    });

    expect(detailed).not.toHaveProperty("takeLanes");
  });

  it("omits take lanes for group tracks", () => {
    registerTrackWithTakeLanes({ is_foldable: 1 });

    const result = readTrack({ trackIndex: 2 });

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

    const result = readTrack({ trackType: "return", trackIndex: 0 });

    expect(result).not.toHaveProperty("takeLaneCount");
    expect(result).not.toHaveProperty("takeLanes");
  });
});
