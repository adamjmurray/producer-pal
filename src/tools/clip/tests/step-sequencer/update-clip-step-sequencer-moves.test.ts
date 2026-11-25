// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A move that re-creates a clip from its notes can't carry a step sequencer
// clip: Live's API can't create one. Those moves are refused before anything is
// made or deleted. Moves Live makes itself keep the clip as it is.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import {
  type MidiClipEra,
  setMidiClipType,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

const SOURCE_ID = "123";
const SOURCE_TRACK = 0;
const DEST_TRACK = 5;
const REASON = "it's a step sequencer clip, and Live's API can't create one";

interface World {
  source: RegisteredMockObject;
  sourceTrack: RegisteredMockObject;
  destTrack: RegisteredMockObject;
}

/**
 * An 8-beat MIDI arrangement clip on track 0, and a MIDI track 5 to move it to.
 * @param era - Which Live's `midi_clip_type` answer the clip gives
 * @param sourcePath - Where the clip sits, a take lane to make it a take
 * @returns The mocks the tests look at
 */
function registerWorld(
  era: MidiClipEra,
  sourcePath: PathLike = livePath.track(SOURCE_TRACK).arrangementClip(0),
): World {
  mockNonExistentObjects();
  registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  const source = registerMockObject(SOURCE_ID, {
    path: sourcePath,
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 8,
      end_time: 16,
      length: 8,
      start_marker: 0,
      loop_start: 0,
      loop_end: 8,
      end_marker: 8,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      name: "Beat",
      color: 16711680,
    },
    methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
  });

  setMidiClipType(source, era);

  const sourceTrack = registerMockObject(`track_${SOURCE_TRACK}`, {
    path: livePath.track(SOURCE_TRACK),
    type: "Track",
    properties: {
      has_midi_input: 1,
      is_frozen: 0,
      arrangement_clips: children(SOURCE_ID),
    },
    methods: { delete_clip: () => null },
  });
  const destTrack = registerTakeLaneTrack({
    trackIndex: DEST_TRACK,
    initialLanes: 1,
  });

  // The main lane's move goes through Live's own arrangement duplicate.
  destTrack.methods.duplicate_clip_to_arrangement = () => {
    registerMockObject("copy", {
      path: livePath.track(DEST_TRACK).arrangementClip(0),
      type: "Clip",
      properties: { start_time: 32, end_time: 40 },
    });

    return ["id", "copy"];
  };

  return { source, sourceTrack, destTrack };
}

/**
 * A clip slot on a MIDI track, empty or not, for a move into the session.
 * @param track - Track index
 * @param scene - Scene index
 * @returns The slot mock
 */
function registerSlot(track: number, scene: number): RegisteredMockObject {
  registerMockObject(`slot-track-${track}`, {
    path: livePath.track(track),
    type: "Track",
    properties: { has_midi_input: 1, is_frozen: 0 },
  });
  registerMockObject(`slot-${track}-${scene}-clip`, {
    path: livePath.track(track).clipSlot(scene).clip(),
  });

  return registerMockObject(`slot-${track}-${scene}`, {
    path: livePath.track(track).clipSlot(scene),
    properties: { has_clip: 0 },
  });
}

/**
 * Whether anything was created or deleted anywhere in the Set.
 * @param world - The mocks of the world
 * @param slot - A destination slot, when the move aimed at one
 * @returns The create and delete calls made, empty when nothing was touched
 */
function madeOrDeleted(world: World, slot?: RegisteredMockObject): string[] {
  return [world.sourceTrack, world.destTrack, ...(slot ? [slot] : [])]
    .flatMap((mock) => mock.call.mock.calls.map(([method]) => method as string))
    .filter((method) =>
      /^(create_|delete_|duplicate_clip_to$)|take_lane/.test(method),
    );
}

describe("update-clip moves - Live 13 step sequencer clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("moves that re-create the clip are refused up front", () => {
    it("to a take lane: no lane made, nothing created, the source kept", async () => {
      const world = registerWorld("step-sequencer");

      await expect(
        updateClip({ id: SOURCE_ID, toPath: `t${DEST_TRACK}/l0[5|1]` }),
      ).rejects.toThrow(`not moved: ${REASON}`);

      expect(madeOrDeleted(world)).toStrictEqual([]);
      expect(world.source.set).not.toHaveBeenCalled();
    });

    it("to a take lane that doesn't exist yet: no lane is made for it", async () => {
      const world = registerWorld("step-sequencer");

      await expect(
        updateClip({ id: SOURCE_ID, toPath: `t${DEST_TRACK}/l3[5|1]` }),
      ).rejects.toThrow(`not moved: ${REASON}`);

      expect(madeOrDeleted(world)).toStrictEqual([]);
    });

    it("from a take lane to the main lane", async () => {
      const world = registerWorld(
        "step-sequencer",
        livePath.track(SOURCE_TRACK).takeLane(0).arrangementClip(0),
      );

      await expect(
        updateClip({ id: SOURCE_ID, toPath: `t${DEST_TRACK}[5|1]` }),
      ).rejects.toThrow(`not moved: ${REASON}`);

      expect(madeOrDeleted(world)).toStrictEqual([]);
      expect(world.source.set).not.toHaveBeenCalled();
    });

    it.each([
      ["the arrangement", livePath.track(SOURCE_TRACK).arrangementClip(0)],
      [
        "a take lane",
        livePath.track(SOURCE_TRACK).takeLane(0).arrangementClip(0),
      ],
    ])(
      "from %s into a clip slot: no scene made, nothing created",
      async (_where, sourcePath) => {
        const world = registerWorld("step-sequencer", sourcePath);
        const slot = registerSlot(DEST_TRACK, 2);

        await expect(
          updateClip({ id: SOURCE_ID, toPath: `t${DEST_TRACK}/s2` }),
        ).rejects.toThrow(REASON);

        expect(madeOrDeleted(world, slot)).toStrictEqual([]);
      },
    );

    it("keeps the rest of the call: the name lands, and the move is said to be refused", async () => {
      const world = registerWorld("step-sequencer");

      const result = await updateClip({
        id: SOURCE_ID,
        name: "Renamed",
        toPath: `t${DEST_TRACK}/l0[5|1]`,
      });

      expect(world.source.set).toHaveBeenCalledWith("name", "Renamed");
      expect(result).toStrictEqual(
        expect.objectContaining({
          id: SOURCE_ID,
          detail: expect.stringContaining(`not moved: ${REASON}`),
        }),
      );
      expect(madeOrDeleted(world)).toStrictEqual([]);
    });
  });

  describe("moves Live makes itself still work", () => {
    it("to another track's main lane", async () => {
      const world = registerWorld("step-sequencer");

      const result = await updateClip({
        id: SOURCE_ID,
        toPath: `t${DEST_TRACK}[5|1]`,
      });

      expect(result).toStrictEqual(expect.objectContaining({ id: "copy" }));
      expect(world.destTrack.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.anything(),
        expect.any(Number),
      );
      expect(world.sourceTrack.call).toHaveBeenCalledWith(
        "delete_clip",
        expect.anything(),
      );
    });
  });

  describe.each<[MidiClipEra, string]>([
    ["notes", "a Live 13 notes clip"],
    ["live-12", "a Live 12 clip"],
  ])("on %s (%s) the same moves re-create it, as before", (era) => {
    it("onto a take lane", async () => {
      registerWorld(era);

      const result = (await updateClip({
        id: SOURCE_ID,
        toPath: `t${DEST_TRACK}/l0[5|1]`,
      })) as { detail?: string };

      expect(result.detail).toContain(`re-created on t${DEST_TRACK}/l0`);
    });

    it("into a clip slot", async () => {
      const world = registerWorld(era);
      const slot = registerSlot(DEST_TRACK, 2);

      await updateClip({ id: SOURCE_ID, toPath: `t${DEST_TRACK}/s2` });

      expect(slot.call).toHaveBeenCalledWith("create_clip", 8);
      expect(world.sourceTrack.call).toHaveBeenCalledWith(
        "delete_clip",
        expect.anything(),
      );
    });
  });
});
