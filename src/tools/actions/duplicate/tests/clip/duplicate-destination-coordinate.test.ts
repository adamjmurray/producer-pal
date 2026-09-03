// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  children,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";

/**
 * A session MIDI clip on track 0, plus MIDI tracks that answer
 * `duplicate_clip_to_arrangement`.
 * @param trackIndexes - The tracks to register, source track included
 * @returns The track mocks, keyed by index
 */
function setupClipAndTracks(
  ...trackIndexes: number[]
): Map<number, RegisteredMockObject> {
  registerMockObject("clip1", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: { is_midi_clip: 1 },
  });

  return new Map(
    trackIndexes.map((index) => [
      index,
      registerTrackWithArrangementDup(index, { has_midi_input: 1 }),
    ]),
  );
}

/**
 * Assert one copy landed on a track at a position.
 * @param track - The destination track mock
 * @param beats - Where the copy went
 */
function expectCopyAt(track: RegisteredMockObject, beats: number): void {
  expect(track.call).toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    "id clip1",
    beats,
  );
}

describe("duplicate - a toPath coordinate", () => {
  it("copies to the lane and position the path names", async () => {
    const tracks = setupClipAndTracks(0, 2);

    registerArrangementClip(2, 0, 8);

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t2[3|1]",
    });

    expectCopyAt(tracks.get(2) as RegisteredMockObject, 8);
    expect(result).toStrictEqual({
      id: livePath.track(2).arrangementClip(0),
      path: "t2[3|1]",
    });
  });

  // The lane alone still needs arrangementStart to say where on it.
  it("copies to a lane named without a position", async () => {
    const tracks = setupClipAndTracks(0, 2);

    registerArrangementClip(2, 0, 8);

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t2",
      arrangementStart: "3|1",
    });

    expectCopyAt(tracks.get(2) as RegisteredMockObject, 8);
  });

  // The position alone: the copy stays on the clip's own track, which is what
  // an omitted toPath already means.
  it("copies to the source's own track when the path names only a position", async () => {
    const tracks = setupClipAndTracks(0);

    registerArrangementClip(0, 0, 8);

    await duplicate({ type: "clip", id: "clip1", toPath: "[3|1]" });

    expectCopyAt(tracks.get(0) as RegisteredMockObject, 8);
  });

  // The shape a lowered toPath can't express: rewriting "[5|1]" as an empty
  // lane makes the middle entry name nothing, and a target list with a hole in
  // it is refused.
  it("reads a bare coordinate in the middle of a list", async () => {
    const tracks = setupClipAndTracks(0, 2, 3);

    registerArrangementClip(2, 0, 8);
    registerArrangementClip(0, 0, 16);
    registerArrangementClip(3, 0, 24);

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t2[3|1],[5|1],t3[7|1]",
    });

    expectCopyAt(tracks.get(2) as RegisteredMockObject, 8);
    expectCopyAt(tracks.get(0) as RegisteredMockObject, 16);
    expectCopyAt(tracks.get(3) as RegisteredMockObject, 24);
    expect(result).toHaveLength(3);
  });

  it("resolves a locator inside the coordinate", async () => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { cue_points: children("cue0") },
    });
    registerMockObject("cue0", { properties: { time: 8, name: "Drop" } });

    const tracks = setupClipAndTracks(0, 2);

    registerArrangementClip(2, 0, 8);

    await duplicate({ type: "clip", id: "clip1", toPath: "t2[loc:Drop]" });

    expectCopyAt(tracks.get(2) as RegisteredMockObject, 8);
  });

  // Two spellings of one position: honoring either is the silent wrong-target
  // bug the grammar exists to prevent.
  it("refuses a coordinate beside arrangementStart, naming both", async () => {
    setupClipAndTracks(0, 2);

    await expect(
      duplicate({
        type: "clip",
        id: "clip1",
        toPath: "t2[3|1]",
        arrangementStart: "5|1",
      }),
    ).rejects.toThrow(
      'duplicate failed: toPath "t2[3|1]" and arrangementStart both name a ' +
        "song position; use one",
    );
  });

  // The coordinates supply a position per entry, so an entry without one has
  // nothing left to fall back on.
  it("refuses an entry with no position of its own", async () => {
    setupClipAndTracks(0, 2, 3);

    await expect(
      duplicate({ type: "clip", id: "clip1", toPath: "t2[3|1],t3" }),
    ).rejects.toThrow(
      'duplicate failed: toPath "t3" names no position; add one, as "t3[5|1]"',
    );
  });
});
