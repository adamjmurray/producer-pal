// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget test for the session clip grid.
//
// A Live Set read counts session clips twice over: once down each scene and
// once along each track. Testing a slot means building an object for it, so
// the grid was built end to end, twice, on every call — and neither pass reads
// a clip, they only count.
//
// These count resolutions rather than asserting output, because the counts
// they produce were always right. Only the price was wrong.

import { describe, expect, it } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { setupLiveSetPathMappedMocks } from "./read-live-set-path-mapped-test-helpers.ts";

const TRACKS = 4;
const SCENES = 4;

/** A Live Set of TRACKS x SCENES, with a clip on the diagonal. */
function setupGrid(): void {
  const trackIds = Array.from(
    { length: TRACKS },
    (_, i) => `track${String(i)}`,
  );
  const sceneIds = Array.from(
    { length: SCENES },
    (_, i) => `scene${String(i)}`,
  );
  const pathIdMap: Record<string, string> = {};
  const objects: Record<string, Record<string, unknown>> = {
    LiveSet: {
      name: "Grid",
      tempo: 120,
      signature_numerator: 4,
      signature_denominator: 4,
      tracks: children(...trackIds),
      return_tracks: children(),
      scenes: children(...sceneIds),
    },
  };

  for (const [trackIndex, trackId] of trackIds.entries()) {
    pathIdMap[String(livePath.track(trackIndex))] = trackId;
    objects[trackId] = {
      name: `Track ${String(trackIndex + 1)}`,
      has_midi_input: 1,
      clip_slots: children(
        ...sceneIds.map((_, s) => `slot${String(trackIndex)}-${String(s)}`),
      ),
      arrangement_clips: children(),
      devices: children(),
    };

    // One clip per track, on the diagonal, so a per-track and a per-scene
    // count of the same grid both come out as 1 each.
    const clipId = `clip${String(trackIndex)}`;

    pathIdMap[livePath.track(trackIndex).clipSlot(trackIndex).clip()] = clipId;
    objects[clipId] = { name: clipId, is_midi_clip: 1 };
  }

  for (const [sceneIndex, sceneId] of sceneIds.entries()) {
    pathIdMap[livePath.scene(sceneIndex)] = sceneId;
    objects[sceneId] = { name: `Scene ${String(sceneIndex + 1)}` };
  }

  pathIdMap[String(livePath.masterTrack())] = "master";
  objects.master = {
    name: "Master",
    has_midi_input: 0,
    clip_slots: children(),
    arrangement_clips: children(),
    devices: children(),
  };

  setupLiveSetPathMappedMocks({ pathIdMap, objects });
}

/**
 * How many clip slots the read built an object for.
 * @returns Resolutions of the session clip shape
 */
function slotResolves(): number {
  return (
    liveApiBuildStats().byShape.find(
      ([shape]) => shape === "live_set tracks * clip_slots * clip",
    )?.[1] ?? 0
  );
}

describe("readLiveSet build budget", () => {
  it("walks the session grid once for both the scene and track counts", () => {
    setupGrid();

    const result = readLiveSet({ include: ["scenes", "tracks"] });

    // One object per slot. Twice this many means the scenes and the tracks
    // went over the same grid separately.
    expect(slotResolves()).toBe(TRACKS * SCENES);

    // The counts still land where they belong: one clip per track, and one per
    // scene, on the diagonal.
    const scenes = result.scenes as { clipCount: number }[];
    const tracks = result.tracks as { sessionClipCount: number }[];

    expect(scenes.map((scene) => scene.clipCount)).toStrictEqual([1, 1, 1, 1]);
    expect(tracks.map((track) => track.sessionClipCount)).toStrictEqual([
      1, 1, 1, 1,
    ]);
  });

  it("does not walk the grid at all for a read that reports neither", () => {
    setupGrid();

    readLiveSet({ include: [] });

    expect(slotResolves()).toBe(0);
  });
});
