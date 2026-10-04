// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A copy given an arrangementLength is written in two steps: Live's duplicate,
// then update-clip growing it. The copy's entry says what the whole copy did to
// the clips already there, once. The call reads each lane once, however many
// copies it makes.

import { describe, expect, it } from "vitest";
import "../../duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerLiveLane,
  type LiveLane,
} from "#src/tools/actions/duplicate/tests/clip/overwrites/duplicate-live-lane-test-helpers.ts";
import { setupArrangementSceneMocks } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { updateClipMock } from "../../setup.ts";

interface Entry {
  id?: string;
  path?: string;
  detail?: string;
}

/** A looping session clip one bar long, which a copy grows to fill its length. */
function registerSource(): void {
  setupArrangementSceneMocks(3);
  registerMockObject("source", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: {
      is_midi_clip: 1,
      length: 4,
      looping: 1,
      loop_start: 0,
      loop_end: 4,
    },
  });
}

/**
 * Make update-clip lengthen the copy the way Live would, and say what it did
 * from its own point of view.
 * @param lane - The lane the copy is on
 * @param end - Where the copy ends once lengthened
 * @param detail - What update-clip says about it
 */
function updateClipGrowsCopy(
  lane: LiveLane,
  end: number,
  detail: string,
): void {
  updateClipMock.mockImplementationOnce(({ ids }) => {
    lane.grow(ids, end);

    return Promise.resolve([{ id: ids, detail }]);
  });
}

/**
 * Copy the source one bar in, two bars long.
 * @returns The copy's entry
 */
async function copyTwoBars(): Promise<Entry> {
  return (await duplicate({
    type: "clip",
    id: "source",
    toPath: "t1[2|1]",
    arrangementLength: "2bar",
  })) as Entry;
}

describe("a copy that is lengthened", () => {
  // The copy splits the clip, then growing it cuts the new tail: update-clip
  // names a clip the copy itself made, but the clip that was there is one.
  it("says what the whole copy did to a clip, not each step", async () => {
    registerSource();

    const lane = registerLiveLane({
      trackIndex: 1,
      copyBeats: 4,
      clips: [{ id: "x", start: 0, end: 16 }],
    });

    updateClipGrowsCopy(lane, 12, "shortened the clip at t1[4|1]");

    expect(await copyTwoBars()).toStrictEqual({
      // The split gave its tail the lane's first new id.
      id: "copy-1-1",
      path: "t1[2|1]",
      detail: "split the clip at t1[1|1] into t1[1|1] and t1[4|1]",
    });
  });

  it("says a clip that only growing overwrote once", async () => {
    registerSource();

    const lane = registerLiveLane({
      trackIndex: 1,
      copyBeats: 4,
      clips: [{ id: "p", start: 8, end: 12 }],
    });

    updateClipGrowsCopy(lane, 12, "overwrote the clip at t1[3|1]");

    const copy = await copyTwoBars();

    expect(copy.detail).toBe("overwrote the clip at t1[3|1]");
  });

  it("keeps what else update-clip said about the copy", async () => {
    registerSource();

    const lane = registerLiveLane({
      trackIndex: 1,
      copyBeats: 4,
      clips: [{ id: "p", start: 8, end: 12 }],
    });

    updateClipGrowsCopy(
      lane,
      12,
      "arrangementLength unchanged: no more content; overwrote the clip at t1[3|1]",
    );

    const copy = await copyTwoBars();

    expect(copy.detail).toBe(
      "arrangementLength unchanged: no more content; overwrote the clip at t1[3|1]",
    );
  });
});

describe("a call that copies to many positions", () => {
  /**
   * How often each clip already on the lane was read.
   * @param trackIndex - The track to copy to
   * @param positions - The destinations' bars
   * @returns One count per clip that was there, in lane order
   */
  async function readsOfExistingClips(
    trackIndex: number,
    positions: number[],
  ): Promise<number[]> {
    const lane = registerLiveLane({
      trackIndex,
      clips: Array.from({ length: 30 }, (_, i) => ({
        id: `old-${trackIndex}-${i}`,
        start: 1000 + i * 8,
        end: 1004 + i * 8,
      })),
    });
    const there = lane.clips().map((clip) => clip.id);

    await duplicate({
      type: "clip",
      id: "source",
      toPath: positions.map((bar) => `t${trackIndex}[${bar}|1]`).join(","),
    });

    return there.map((id) => lane.mocks.get(id)?.get.mock.calls.length ?? 0);
  }

  it("reads the lane once, not once per copy", async () => {
    registerSource();

    const one = await readsOfExistingClips(1, [1]);
    const six = await readsOfExistingClips(2, [1, 3, 5, 7, 9, 11]);

    expect(one.every((reads) => reads > 0)).toBe(true);
    expect(six).toStrictEqual(one);
  });
});
