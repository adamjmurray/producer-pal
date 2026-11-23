// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live 12.3 crashes when a re-create lands strictly inside a clip, so on a
// main lane the clip in the way is cut at the new start first.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  duplicatingTrackMethods,
  mockContext,
  setupArrangementClip,
  setupClip,
} from "../helpers/arrangement-mock-objects.ts";
import { registerLiveVersion } from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { recreateClip } from "#src/tools/shared/clip/recreate-clip.ts";

/**
 * A 2-bar MIDI source on take lane 0 of t0, and t1's main lane holding a clip
 * from bar 1 to bar 5 that shows the cut once the rest comes back.
 * @returns t1's mock
 */
function registerWorld(): ReturnType<typeof registerMockObject> {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
  registerMockObject("src", {
    path: livePath.track(0).takeLane(0).arrangementClip(0),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0,
      end_time: 8,
      length: 8,
      start_marker: 0,
      end_marker: 8,
      loop_start: 0,
      loop_end: 8,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
    },
    methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
  });

  const head = { is_arrangement_clip: 1, start_time: 0, end_time: 16 };

  setupArrangementClip("200", 1, head);
  setupClip("400", {
    properties: { is_arrangement_clip: 1, start_time: 116, end_time: 132 },
  });
  setupClip("500", {
    properties: { is_arrangement_clip: 1, start_time: 4, end_time: 16 },
  });

  const trackProps: Record<string, unknown> = {
    arrangement_clips: ["id", "200"],
  };
  const methods = duplicatingTrackMethods();

  return registerMockObject("track-1", {
    path: livePath.track(1),
    type: "Track",
    properties: trackProps,
    methods: {
      ...methods,
      // Bringing the rest back is where the lane shows the cut.
      duplicate_clip_to_arrangement: (...args: unknown[]) => {
        const result = methods.duplicate_clip_to_arrangement?.(...args);

        if (args[1] === 4) {
          head.end_time = 4;
          trackProps.arrangement_clips = ["id", "200", "id", "500"];
        }

        return result;
      },
    },
  });
}

describe("recreateClip inside a main-lane clip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cuts the clip at the new start first on Live 12.3", () => {
    registerLiveVersion("12.3.8");
    const track = registerWorld();

    try {
      recreateClip(
        LiveAPI.from(livePath.track(0).takeLane(0).arrangementClip(0)),
        LiveAPI.from(livePath.track(1)),
        4,
        undefined,
        undefined,
        [],
        mockContext,
      );
    } catch {
      // The mock's new clip has no span; only the calls matter here.
    }

    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 400",
      4,
    );
    expect(track.call).toHaveBeenLastCalledWith("create_midi_clip", 4, 8);
  });

  it("creates straight away on Live 12.4", () => {
    registerLiveVersion("12.4.16");
    const track = registerWorld();

    try {
      recreateClip(
        LiveAPI.from(livePath.track(0).takeLane(0).arrangementClip(0)),
        LiveAPI.from(livePath.track(1)),
        4,
        undefined,
        undefined,
        [],
        mockContext,
      );
    } catch {
      // As above.
    }

    expect(track.call).toHaveBeenCalledTimes(1);
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 4, 8);
  });
});
