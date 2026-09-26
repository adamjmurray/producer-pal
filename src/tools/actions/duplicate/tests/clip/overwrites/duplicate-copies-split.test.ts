// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Copies of different lengths, where a later copy lands inside an earlier one
// and splits it. The tail it leaves belongs to the copy it split, never to a
// copy that landed before that one.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../../duplicate-mocks-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { registerLiveSet } from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";

/** A clip on the simulated track. */
interface LaneClip {
  id: string;
  start: number;
  end: number;
}

/**
 * Session sources on track 0, one per scene, with these lengths in beats.
 * @param lengths - Each source's length, by id
 */
function registerSources(lengths: Record<string, number>): void {
  for (const [scene, [id, length]] of Object.entries(lengths).entries()) {
    registerMockObject(id, {
      path: livePath.track(0).clipSlot(scene).clip(),
      properties: { is_midi_clip: 1, length },
    });
  }
}

/**
 * Track 1, overwriting the way Live does: a clip covered whole goes, one
 * covered across its front is re-created as a new clip holding the rest, one
 * covered across its back is shortened in place, and one a copy lands inside
 * keeps its front and id while its tail becomes a new clip.
 * @param lengths - Each source's length, by id
 */
function registerSplittingTrack(lengths: Record<string, number>): void {
  let placed: LaneClip[] = [];
  let slot = 0;
  let copies = 0;

  const place = (id: string, start: number, end: number): LaneClip => {
    registerMockObject(id, {
      path: livePath.track(1).arrangementClip(slot++),
      properties: { is_arrangement_clip: 1, start_time: start, end_time: end },
    });

    return { id, start, end };
  };

  const cut = (clip: LaneClip, start: number, end: number): LaneClip[] => {
    if (clip.start < start) {
      const properties = lookupMockObject(clip.id)?.properties ?? {};
      const tail =
        clip.end > end ? [place(`tail-of-${clip.id}`, end, clip.end)] : [];

      properties.end_time = start;

      return [{ ...clip, end: start }, ...tail];
    }

    registerMockObject(clip.id, { path: "" });

    return clip.end > end ? [place(`rest-of-${clip.id}`, end, clip.end)] : [];
  };

  const land = (start: number, end: number): unknown[] => {
    const kept = placed.flatMap((clip) =>
      clip.end <= start || clip.start >= end ? [clip] : cut(clip, start, end),
    );
    const copy = place(`copy-${copies++}`, start, end);

    placed = [...kept, copy];
    track.properties.arrangement_clips = children(
      ...placed.map((clip) => clip.id),
    );

    return ["id", copy.id];
  };

  const track = registerMockObject("live_set/tracks/1", {
    path: livePath.track(1),
    properties: { has_midi_input: 1, arrangement_clips: [] },
    methods: {
      duplicate_clip_to_arrangement: (source: unknown, beats: unknown) =>
        land(
          Number(beats),
          Number(beats) + (lengths[String(source).replace(/^id /, "")] ?? 0),
        ),
    },
  });
}

describe("a copy another copy split", () => {
  it("keeps its tail from a copy that landed before it", async () => {
    const lengths = { s16: 16, s4: 4, s12: 12, s2: 2 };

    registerLiveSet();
    registerSources(lengths);
    registerSplittingTrack(lengths);

    // The 16 lands, the 4 takes its front, the 12 buries the rest, and the 2
    // splits the 12: the tail at 3|3 is the 12's, and the 16 has nothing left.
    const result = await duplicate({
      type: "clip",
      id: "s16,s4,s12,s2",
      toPath: "t1[1|1],t1[1|1],t1[2|1],t1[3|1]",
    });

    expect(result).toStrictEqual([
      {
        path: "t1[1|1]",
        deleted: true,
        detail: "a later copy in this call landed on it",
      },
      { id: "copy-1", path: "t1[1|1]" },
      { id: "copy-2", path: "t1[2|1]" },
      { id: "copy-3", path: "t1[3|1]" },
    ]);
  });
});
