// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A later copy in the call can land on an earlier one: covering it whole
// deletes it, and covering only its front leaves the rest under a new id.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../../duplicate-mocks-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { markOverwrittenCopies } from "#src/tools/actions/duplicate/helpers/clip/overwritten-copies.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "#src/tools/actions/duplicate/helpers/minimal-clip-info.ts";
import {
  registerLiveSet,
  registerTakeLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";

/** Every copy's length, in beats. */
const COPY_BEATS = 16;

const DELETED = "a later copy in this call landed on it";
const TRIMMED = "trimmed: a later copy in this call landed on part of it";
const PROMOTED = "promoted to the main lane by re-creating it";

describe("a copy a later copy in the call landed on", () => {
  it("is deleted when the later copy covers all of it", async () => {
    registerSource();
    registerTrimmingTrack();

    const result = await duplicate({
      type: "clip",
      id: "source",
      toPath: "t1",
      arrangementStart: "5|1,5|1",
    });

    expect(result).toStrictEqual([
      { path: "t1[5|1]", deleted: true, detail: DELETED },
      { id: "copy-1", path: "t1[5|1]" },
    ]);
  });

  it("points at what is left when the later copy covers only its front", async () => {
    registerSource();
    registerTrimmingTrack();

    const result = await duplicate({
      type: "clip",
      id: "source",
      toPath: "t1",
      arrangementStart: "5|1,3|1",
    });

    expect(result).toStrictEqual([
      { id: "rest-of-copy-0", path: "t1[7|1]", detail: TRIMMED },
      { id: "copy-1", path: "t1[3|1]" },
    ]);
  });

  // The later copy is itself cut short, and what is left of it ends where the
  // earlier copy did — it must not be mistaken for the earlier one's.
  it("does not claim a later copy's remainder as its own", async () => {
    registerSource();
    registerTrimmingTrack();

    const result = await duplicate({
      type: "clip",
      id: "source",
      toPath: "t1",
      arrangementStart: "5|1,5|1,4|1",
    });

    expect(result).toStrictEqual([
      { path: "t1[5|1]", deleted: true, detail: DELETED },
      { id: "rest-of-copy-1", path: "t1[8|1]", detail: TRIMMED },
      { id: "copy-2", path: "t1[4|1]" },
    ]);
  });

  // A promote re-creates the clip rather than duplicating it, and its entry
  // carries a detail from the start.
  it("points a promoted copy at what is left of it", async () => {
    registerPromoteSources();
    registerTrimmingTrack();

    const result = await duplicate({
      type: "clip",
      id: "tl_src_clip,source",
      toPath: "t1[5|1],t1[3|1]",
    });

    expect(result).toStrictEqual([
      {
        id: "rest-of-copy-0",
        path: "t1[7|1]",
        detail: `${PROMOTED}; ${TRIMMED}`,
      },
      { id: "copy-1", path: "t1[3|1]" },
    ]);
  });

  // Its promote detail described a clip that is gone, so only the deletion
  // is said.
  it("drops a deleted copy's earlier detail", async () => {
    registerPromoteSources();
    registerTrimmingTrack();

    const result = await duplicate({
      type: "clip",
      id: "tl_src_clip,source",
      toPath: "t1[5|1],t1[5|1]",
    });

    expect(result).toStrictEqual([
      { path: "t1[5|1]", deleted: true, detail: DELETED },
      { id: "copy-1", path: "t1[5|1]" },
    ]);
  });

  // The promoted copy's rest ends where the first copy did too, so the first
  // copy could claim it if the promoted one didn't find it first.
  it("keeps a promoted copy's rest from an earlier copy in a mixed call", async () => {
    registerPromoteSources();
    registerSource("source2", 1);
    registerTrimmingTrack();

    const result = await duplicate({
      type: "clip",
      id: "source,tl_src_clip,source2",
      toPath: "t1[5|1],t1[5|1],t1[4|1]",
    });

    expect(result).toStrictEqual([
      { path: "t1[5|1]", deleted: true, detail: DELETED },
      {
        id: "rest-of-copy-1",
        path: "t1[8|1]",
        detail: `${PROMOTED}; ${TRIMMED}`,
      },
      { id: "copy-2", path: "t1[4|1]" },
    ]);
  });
});

// Copies onto a source land last but keep their place in the result, so the
// result's order is not the order the copies landed in.
describe("copies that landed in a different order than the result lists", () => {
  it("gives the rest to the copy that landed later", () => {
    registerLiveSet();

    const track = registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: { arrangement_clips: [] },
    });

    // Y lands at 3|1, X lands over all of it from 2|3, then Z takes X's front.
    const y = landedCopy("y", 0, 8, 12);
    const x = landedCopy("x", 1, 6, 12);

    registerMockObject("y", { path: "" });

    const z = landedCopy("z", 2, 4, 8);

    registerMockObject("x", { path: "" });
    landedCopy("x-rest", 3, 8, 12);
    track.properties.arrangement_clips = children("z", "x-rest");

    // X was named first, Y second: the result lists them in that order.
    const result = [x, y, z];

    markOverwrittenCopies(result);

    expect(result).toStrictEqual([
      { id: "x-rest", path: "t1[3|1]", detail: TRIMMED },
      { path: "t1[3|1]", deleted: true, detail: DELETED },
      { id: "z", path: "t1[2|1]" },
    ]);
  });
});

// A later copy can cut the back off what an earlier trim left, or land inside
// it: the rest no longer ends where the copy did, but it is still there.
describe("a copy whose rest a later copy cut again", () => {
  /**
   * Land X over 1|1-9|1, then Y over its front (1|1-3|1), which re-creates
   * X's rest from 3|1.
   * @returns X's and Y's entries, and the track
   */
  function landFrontTrimmedCopy(): {
    x: MinimalClipInfo;
    y: MinimalClipInfo;
    track: RegisteredMockObject;
  } {
    registerLiveSet();

    const track = registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: { arrangement_clips: [] },
    });
    const x = landedCopy("x", 0, 0, 32);
    const y = landedCopy("y", 1, 0, 8);

    registerMockObject("x", { path: "" });

    return { x, y, track };
  }

  it("points at the rest a later copy cut short at the back", () => {
    const { x, y, track } = landFrontTrimmedCopy();
    const z = landedCopy("z", 2, 16, 32);

    landedCopy("x-rest", 3, 8, 16);
    track.properties.arrangement_clips = children("y", "x-rest", "z");

    const result = [x, y, z];

    markOverwrittenCopies(result);

    expect(result[0]).toStrictEqual({
      id: "x-rest",
      path: "t1[3|1]",
      detail: TRIMMED,
    });
  });

  // A later copy whose span couldn't be read may have cut the rest, so what
  // is there can't be told apart from its own pieces.
  it("claims nothing past a later copy whose span is unknown", () => {
    const { x, y, track } = landFrontTrimmedCopy();
    const z = landedCopy("z", 2, 16, 16);

    landedCopy("x-rest", 3, 8, 16);
    track.properties.arrangement_clips = children("y", "x-rest", "z");

    const result = [x, y, z];

    markOverwrittenCopies(result);

    expect(result[0]).toStrictEqual({
      path: "t1[1|1]",
      deleted: true,
      detail: DELETED,
    });
  });

  it("points at the end piece of a rest a later copy split", () => {
    const { x, y, track } = landFrontTrimmedCopy();
    const z = landedCopy("z", 2, 16, 20);

    landedCopy("x-front", 3, 8, 16);
    landedCopy("x-back", 4, 20, 32);
    track.properties.arrangement_clips = children(
      "y",
      "x-front",
      "z",
      "x-back",
    );

    const result = [x, y, z];

    markOverwrittenCopies(result);

    expect(result[0]).toStrictEqual({
      id: "x-back",
      path: "t1[6|1]",
      detail: TRIMMED,
    });
  });
});

/**
 * An arrangement clip on track 1, and the entry duplicate makes for it.
 * @param id - The clip's id
 * @param index - Its place in the track's clip list
 * @param start - Its start, in beats
 * @param end - Its end, in beats
 * @returns The entry
 */
function landedCopy(
  id: string,
  index: number,
  start: number,
  end: number,
): MinimalClipInfo {
  registerMockObject(id, {
    path: livePath.track(1).arrangementClip(index),
    properties: { is_arrangement_clip: 1, start_time: start, end_time: end },
  });

  return getMinimalClipInfo(LiveAPI.from(id));
}

/** A session source and a take-lane source, both as long as every copy. */
function registerPromoteSources(): void {
  registerLiveSet();
  registerSource();
  registerTakeLaneSource({
    length: COPY_BEATS,
    loop_end: COPY_BEATS,
    end_marker: COPY_BEATS,
  });
}

/**
 * A MIDI session clip on track 0 to copy.
 * @param id - The clip's id
 * @param scene - The slot it sits in
 */
function registerSource(id = "source", scene = 0): void {
  registerMockObject(id, {
    path: livePath.track(0).clipSlot(scene).clip(),
    properties: { is_midi_clip: 1 },
  });
}

interface PlacedClip {
  mock: RegisteredMockObject;
  start: number;
  end: number;
}

/**
 * Track 1, which takes a duplicate or a created clip and handles only the two
 * overlaps these tests need: a clip covered whole is cleared, and one covered
 * across its front is re-created as a new clip holding the rest. A clip covered
 * any other way is just cleared.
 * @returns The registered track mock
 */
function registerTrimmingTrack(): RegisteredMockObject {
  let placed: PlacedClip[] = [];
  let slot = 0;
  let copies = 0;

  const place = (id: string, start: number, end: number): PlacedClip => {
    const path = livePath.track(1).arrangementClip(slot++);
    const mock = registerMockObject(id, {
      path,
      properties: { is_arrangement_clip: 1, start_time: start, end_time: end },
    });

    return { mock, start, end };
  };

  const land = (start: number, end: number): unknown[] => {
    const kept: PlacedClip[] = [];

    for (const clip of placed) {
      if (clip.end <= start || clip.start >= end) {
        kept.push(clip);
        continue;
      }

      registerMockObject(clip.mock.id, { path: "" });

      if (clip.start >= start && clip.end > end) {
        kept.push(place(`rest-of-${clip.mock.id}`, end, clip.end));
      }
    }

    const copy = place(`copy-${copies++}`, start, end);

    placed = [...kept, copy];
    track.properties.arrangement_clips = children(
      ...placed.map((clip) => clip.mock.id),
    );

    return ["id", copy.mock.id];
  };

  const track = registerMockObject("live_set/tracks/1", {
    path: livePath.track(1),
    properties: { has_midi_input: 1, arrangement_clips: [] },
    methods: {
      duplicate_clip_to_arrangement: (_source: unknown, beats: unknown) =>
        land(Number(beats), Number(beats) + COPY_BEATS),
      create_midi_clip: (start: unknown, length: unknown) =>
        land(Number(start), Number(start) + Number(length)),
    },
  });

  return track;
}
