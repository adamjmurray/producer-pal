// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a copy goes over is read before any copy lands. A copy whose stretch
// can't be read or measured covers nothing in that plan: the call still runs,
// and the copy reports its own failure, if any, when its turn comes.

import { describe, expect, it } from "vitest";
import "../../duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  duplicateToLanes,
  type LaneCopyEntry,
  registerLiveSet,
  registerMainLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

describe("a copy whose stretch can't be read up front", () => {
  it("still runs the call, each copy failing on its own entry", async () => {
    const source = registerSessionClip("source", 0, 16);
    const track = registerCopyTrack();
    const read = source.get.getMockImplementation() as (p: string) => unknown;

    source.get.mockImplementation((property: string) => {
      if (property === "length") {
        throw new Error("Live went away");
      }

      return read(property);
    });

    const result = await duplicate({
      type: "clip",
      id: "source",
      toPath: "t1",
      arrangementStart: "5|1,9|1",
    });

    expect(result).toStrictEqual([
      { path: "t1[5|1]", ok: false, detail: "Live went away" },
      { path: "t1[9|1]", ok: false, detail: "Live went away" },
    ]);
    expect(track.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );
  });

  // Without a length, the copy can't be said to reach the later source, so it
  // isn't refused for landing on it.
  it("doesn't refuse a copy with no length for covering a later source", async () => {
    registerLiveSet();
    registerSessionClip("empty", 0, 0);
    registerMockObject("later", {
      path: livePath.track(1).arrangementClip(0),
      properties: {
        is_midi_clip: 1,
        is_arrangement_clip: 1,
        start_time: 0,
        end_time: 16,
        length: 16,
      },
    });

    const track = registerCopyTrack();

    await duplicate({
      type: "clip",
      id: "empty,later",
      toPath: "t1[1|1],t1[9|1]",
    });

    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id empty",
      0,
    );
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id later",
      32,
    );
  });

  // The plan can't place clips with no end, but the second copy still buries
  // the first once both have landed.
  it("still finds a lane copy buried by a later one", async () => {
    registerMainLaneSource([0, 16], {}, { end_time: Number.NaN });
    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await duplicateToLanes<LaneCopyEntry[]>({
      id: "src_track",
      toPath: "t1/l0,t1/l0",
    });

    expect(result[0]?.clips).toStrictEqual([
      {
        path: "t1/l0[1|1]",
        detail: "overwritten later in this call by t1/l0[1|1]",
      },
      {
        path: "t1/l0[5|1]",
        detail: "overwritten later in this call by t1/l0[5|1]",
      },
    ]);
    expect(result[1]?.clips.map((clip) => clip.path)).toStrictEqual([
      "t1/l0[1|1]",
      "t1/l0[5|1]",
    ]);
  });
});

/**
 * A MIDI session clip on track 0.
 * @param id - The clip's id
 * @param scene - The slot it sits in
 * @param length - Its length, in beats
 * @returns The clip's mock
 */
function registerSessionClip(
  id: string,
  scene: number,
  length: number,
): RegisteredMockObject {
  return registerMockObject(id, {
    path: livePath.track(0).clipSlot(scene).clip(),
    properties: { is_midi_clip: 1, length },
  });
}

/**
 * Track 1, a MIDI track whose arrangement duplicate lands a fresh clip.
 * @returns The track's mock
 */
function registerCopyTrack(): RegisteredMockObject {
  let copies = 0;

  return registerMockObject("track1", {
    path: livePath.track(1),
    properties: { has_midi_input: 1, arrangement_clips: [] },
    methods: {
      duplicate_clip_to_arrangement: () => {
        const id = `copy-${copies}`;

        registerMockObject(id, {
          path: livePath.track(1).arrangementClip(10 + copies++),
          properties: { is_arrangement_clip: 1, start_time: 0, end_time: 4 },
        });

        return ["id", id];
      },
    },
  });
}
