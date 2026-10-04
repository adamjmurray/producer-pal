// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Two clips of one call sent to the same spot: the earlier one's move is
// pointless, so it is left unwritten and says so, instead of being written and
// then reported deleted.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  lookupMockObject,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

const FIRST = "100";
const SECOND = "101";
/** 17|1 in beats: clear of both clips, so neither move self-overlaps. */
const TARGET_BEATS = 64;

/**
 * Register an arrangement clip at a spot on track 0.
 * @param id - The clip's id
 * @param slot - Its place in the track's clip list
 * @param start - Where it starts, in beats
 * @param length - How long it is, in beats
 */
function registerClip(
  id: string,
  slot: number,
  start: number,
  length: number,
): void {
  registerMockObject(id, {
    path: livePath.track(0).arrangementClip(slot),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: start,
      end_time: start + length,
      signature_numerator: 4,
      signature_denominator: 4,
    },
  });
}

/**
 * Two arrangement clips on one track, both about to be moved to one position.
 * @param lengths - How long the first and second clip are, in beats
 * @param duplicateFails - Answer the duplicate with id 0, as a frozen track does
 * @returns The track mock, which records the deletes and the duplicates
 */
function setUpTwoClips(
  lengths: [number, number],
  duplicateFails = false,
): RegisteredMockObject {
  registerMockObject("live-set", {
    path: "live_set",
    type: "Song",
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
  registerClip(FIRST, 0, 0, lengths[0]);
  registerClip(SECOND, 1, 100, lengths[1]);

  const lengthOf = new Map([
    [`id ${FIRST}`, lengths[0]],
    [`id ${SECOND}`, lengths[1]],
  ]);
  let copies = 0;

  return registerMockObject("covers-track", {
    path: livePath.track(0),
    type: "Track",
    properties: { track_index: 0 },
    methods: {
      // Live answers a duplicate it silently declined — on a frozen track, say
      // — with an id that resolves to nothing.
      duplicate_clip_to_arrangement: (source) => {
        if (duplicateFails) {
          return ["id", 0];
        }

        const id = `copy-${String(++copies)}`;

        registerClip(
          id,
          copies + 1,
          TARGET_BEATS,
          lengthOf.get(String(source)) as number,
        );

        return ["id", id];
      },
      delete_clip: () => null,
    },
  });
}

/**
 * The calls the track was made to, by method.
 * @param track - The track mock
 * @param method - The method
 * @returns The args of each call
 */
function callsTo(track: RegisteredMockObject, method: string): unknown[][] {
  return vi
    .mocked(track.call)
    .mock.calls.filter(([name]) => name === method)
    .map(([, ...args]) => args);
}

describe("a clip a later clip of the call lands on top of", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is left unwritten when the later one covers all of it", async () => {
    const track = setUpTwoClips([16, 16]);

    const result = (await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
    })) as ClipResult[];

    expect(result).toStrictEqual([
      { id: FIRST, detail: "overwritten later in this call by t0[17|1]" },
      { id: "copy-1", path: "t0[17|1]" },
    ]);
    // Only the later clip was copied and cleared away.
    expect(callsTo(track, "duplicate_clip_to_arrangement")).toStrictEqual([
      [`id ${SECOND}`, TARGET_BEATS],
    ]);
    expect(callsTo(track, "delete_clip")).toStrictEqual([[`id ${SECOND}`]]);
  });

  it("never says it was deleted, or that it failed", async () => {
    setUpTwoClips([16, 16]);

    const [first] = (await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
    })) as ClipResult[];

    expect(first).not.toHaveProperty("deleted");
    expect(first).not.toHaveProperty("ok");
  });

  // The whole of the earlier target is left unwritten: what else it asked is
  // lost with the move, which is what last-wins means.
  it("is left unwritten with the rest of what it asked", async () => {
    setUpTwoClips([16, 16]);

    const result = (await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
      name: "Lost,Kept",
    })) as ClipResult[];

    expect(result[0]).toStrictEqual({
      id: FIRST,
      detail: "overwritten later in this call by t0[17|1]",
    });
    expect(lookupMockObject(FIRST)?.set).not.toHaveBeenCalled();
  });

  it("is written and says it was cut short when the later one covers only part of it", async () => {
    const track = setUpTwoClips([16, 8]);

    const result = (await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
    })) as ClipResult[];

    expect(callsTo(track, "duplicate_clip_to_arrangement")).toHaveLength(2);
    expect(result[0]).toStrictEqual(
      expect.objectContaining({
        detail: expect.stringContaining(
          "shortened by t0[17|1] later in this call",
        ),
      }),
    );
    expect(result[0]).not.toHaveProperty("ok");
  });

  // The move that was to replace it never happened, so nothing did.
  it("is ok:false when the move that was to replace it fails", async () => {
    const track = setUpTwoClips([16, 16], true);

    const result = (await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
    })) as ClipResult[];

    expect(result).toStrictEqual([
      {
        id: FIRST,
        ok: false,
        detail: "not written: t0[17|1] was meant to replace it, but failed",
      },
      {
        id: SECOND,
        ok: false,
        detail:
          "not moved: Live made no copy at the destination, so the original was kept",
      },
    ]);
    expect(callsTo(track, "delete_clip")).toStrictEqual([]);
  });
});
