// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { setupLiveSetPathMappedMocks } from "./read-live-set-path-mapped-test-helpers.ts";

describe("readLiveSet - inclusion", () => {
  it("returns sceneCount when scenes not included", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      objects: {
        LiveSet: {
          name: "Scene Count Test Set",
          is_playing: 0,
          back_to_arranger: 1,
          scale_mode: 0,
          tempo: 120,
          signature_numerator: 4,
          signature_denominator: 4,
          tracks: children(),
          scenes: children("scene9", "scene10", "scene11"),
        },
      },
    });

    // Default include is [] which doesn't include "scenes"
    const result = readLiveSet();

    // Verify that sceneCount is returned instead of scenes array
    expect(result.sceneCount).toBe(3);
    expect(result.scenes).toBeUndefined();
  });

  it("returns minimal data when include is an empty array", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set",
      objects: {
        LiveSet: {
          tracks: children(),
          return_tracks: children(),
          scenes: children(),
          name: "Test Set",
          is_playing: 0,
          back_to_arranger: 0,
          tempo: 120,
          signature_numerator: 4,
          signature_denominator: 4,
          scale_mode: 0,
        },
      },
    });

    const result = readLiveSet({ include: [] });

    // Should have basic song properties with counts
    expect(result).toStrictEqual(
      expect.objectContaining({
        name: "Test Set",
        tempo: 120,
        timeSignature: "4/4",
        sceneCount: 0,
        regularTrackCount: 0,
        returnTrackCount: 0,
      }),
    );

    // Should NOT include id or any track/scene arrays
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("tracks");
    expect(result).not.toHaveProperty("returnTracks");
    expect(result).not.toHaveProperty("masterTrack");
    expect(result).not.toHaveProperty("scenes");
  });

  it("returns regularTrackCount when tracks not included", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.track(1))]: "track2",
      },
      objects: {
        LiveSet: {
          name: "Count Test",
          tracks: children("track1", "track2"),
          return_tracks: children(),
          scenes: children(),
        },
      },
    });

    const result = readLiveSet({ include: [] });

    expect(result.regularTrackCount).toBe(2);
    expect(result.tracks).toBeUndefined();
  });

  it("returns returnTrackCount when tracks not included", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set",
      pathIdMap: {
        [String(livePath.returnTrack(0))]: "return1",
        [String(livePath.returnTrack(1))]: "return2",
      },
      objects: {
        LiveSet: {
          name: "Return Count Test",
          tracks: children(),
          return_tracks: children("return1", "return2"),
          scenes: children(),
        },
        [String(livePath.returnTrack(0))]: {
          has_midi_input: 0,
          name: "Return A",
        },
        [String(livePath.returnTrack(1))]: {
          has_midi_input: 0,
          name: "Return B",
        },
      },
    });

    const result = readLiveSet({ include: [] });

    expect(result.returnTrackCount).toBe(2);
    expect(result.returnTracks).toBeUndefined();
  });

  it("omits name property when Live Set name is empty string", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set",
      objects: {
        LiveSet: {
          name: "", // Empty name
          tempo: 120,
          signature_numerator: 4,
          signature_denominator: 4,
          back_to_arranger: 1,
          is_playing: 0,
          tracks: [],
          scenes: [],
        },
      },
    });

    const result = readLiveSet();

    expect(result.name).toBeUndefined();
    expect(result).not.toHaveProperty("name");
  });
});
