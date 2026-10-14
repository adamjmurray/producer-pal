// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A session clip copied at another length than its own writes its automation
// by stamps, then is placed from a copy that carries none.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import "../../../tests/duplicate-mocks-test-helpers.ts";
import {
  createShortenedClipInHoldingMock,
  updateClipMock,
} from "../../../tests/setup.ts";
import {
  copyAtLength,
  shownByStamps,
} from "./stamp-automation-test-helpers.ts";
import { registerStampWorld } from "./stamp-world-test-helpers.ts";

describe("a session clip with automation, copied at another length", () => {
  it("stamps a shorter copy's span, then holds the envelope-free scratch", async () => {
    const world = registerStampWorld();

    await copyAtLength(world, 3);

    expect(shownByStamps(world.stamps())).toStrictEqual([[0, 3, 0]]);

    // The holding area is fed the scratch copy, cleared of envelopes: its
    // automation never reaches the lane.
    const [held] = createShortenedClipInHoldingMock.mock
      .calls[0] as unknown as [{ id: string }];

    expect(held.id).not.toBe(world.source.id);
    expect(lookupMockObject(held.id)?.properties.has_envelopes).toBe(0);
    expect(lookupMockObject(held.id)?.path).toBe(
      livePath.track(0).clipSlot(1).clip(),
    );
  });

  it("stamps a lengthened copy over its whole span, with a partial last tile", async () => {
    const world = registerStampWorld();

    await copyAtLength(world, 10);

    expect(shownByStamps(world.stamps())).toStrictEqual([
      [0, 4, 0],
      [0, 4, 4],
      [0, 2, 8],
    ]);

    // The first copy is then made from the envelope-free scratch and lengthened.
    expect(world.copies().filter((copy) => !copy.envelopes)).toHaveLength(1);
    expect(updateClipMock).toHaveBeenCalledWith(
      expect.objectContaining({ arrangementLength: "2bar+n/2" }),
      expect.anything(),
    );
  });

  it("deletes each stamp as soon as it is made", async () => {
    const world = registerStampWorld();

    await copyAtLength(world, 10);

    const kinds = world.events
      .filter((event) => ["copy", "delete"].includes(event.kind))
      .map((event) => event.kind);

    expect(kinds.slice(0, 6)).toStrictEqual([
      "copy",
      "delete",
      "copy",
      "delete",
      "copy",
      "delete",
    ]);
  });

  it("leaves the markers alone when whole loops are what it stamps", async () => {
    const world = registerStampWorld();

    await copyAtLength(world, 16);

    expect(world.stamps()).toHaveLength(4);
    expect(world.events.filter((event) => event.kind === "set")).toHaveLength(
      0,
    );
  });

  it("sets the markers once for a run of whole loops, then again for the cut one", async () => {
    const world = registerStampWorld({ source: { start_marker: 1 } });

    await copyAtLength(world, 14);

    // [1,4] once, [0,4] once for the two whole loops, [0,3] once for the rest.
    const writes = world.events.filter((event) => event.kind === "set");

    expect(world.stamps()).toHaveLength(4);
    expect(writes).toHaveLength(3 * 4);
  });

  it("wraps from a mid-loop start", async () => {
    const world = registerStampWorld({ source: { start_marker: 1 } });

    await copyAtLength(world, 9);

    expect(shownByStamps(world.stamps())).toStrictEqual([
      [1, 4, 0],
      [0, 4, 3],
      [0, 2, 7],
    ]);
  });

  it("plays the pre-roll once", async () => {
    const world = registerStampWorld({
      source: { loop_start: 2, loop_end: 6, start_marker: 0, end_marker: 6 },
    });

    await copyAtLength(world, 11);

    expect(shownByStamps(world.stamps())).toStrictEqual([
      [0, 6, 0],
      [2, 6, 6],
      [2, 3, 10],
    ]);
  });

  it("stamps an unlooped clip from its start marker", async () => {
    const world = registerStampWorld({
      source: { looping: 0, start_marker: 1, loop_end: 5, end_marker: 5 },
    });

    await copyAtLength(world, 8);

    expect(shownByStamps(world.stamps())).toStrictEqual([[1, 9, 0]]);
  });

  it("carries warped audio the same way", async () => {
    const world = registerStampWorld({
      source: { is_midi_clip: 0, warping: 1 },
    });

    await copyAtLength(world, 6);

    expect(shownByStamps(world.stamps())).toStrictEqual([
      [0, 4, 0],
      [0, 2, 4],
    ]);
  });

  it("stamps from the destination track when the source sits on another", async () => {
    const world = registerStampWorld({ sourceTrack: 1 });

    await copyAtLength(world, 6);

    expect(world.stamps().map((stamp) => stamp.trackIndex)).toStrictEqual([
      0, 0,
    ]);
  });
});
