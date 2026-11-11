// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A copy that re-creates a clip from its notes can't carry a step sequencer
// clip: Live's API can't create one. Those copies are skipped before anything
// is made. Copies Live makes itself keep the clip as it is.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../../duplicate-mocks-test-helpers.ts";
import {
  expectNoNotesApiCalls,
  type MidiClipEra,
  setMidiClipType,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  maxError: vi.fn(),
  maxLog: vi.fn(),
  emitWarning: vi.fn(),
}));

import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  duplicateToLanes,
  type LaneCopyEntry,
  registerArrangementSource,
  registerLiveSet,
  registerMainLaneSource,
  registerTakeLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";

const REASON = "it's a step sequencer clip, and Live's API can't create one";

/**
 * Give a registered clip the answer a Live of this era gives.
 * @param id - The clip's mock id
 * @param era - Which Live's `midi_clip_type` answer to give
 * @returns The clip's mock
 */
function typed(id: string, era: MidiClipEra): RegisteredMockObject {
  const clip = lookupMockObject(id) as RegisteredMockObject;

  setMidiClipType(clip, era);

  return clip;
}

describe("duplicate - Live 13 step sequencer clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("copies that re-create the clip are skipped before anything is made", () => {
    it("onto a take lane: no lane is made, and nothing is read from the clip", async () => {
      registerLiveSet();
      registerArrangementSource(true);
      const source = typed("src_clip", "step-sequencer");
      const track = registerTakeLaneTrack({ initialLanes: 0 });

      await expect(
        duplicate({
          type: "clip",
          id: "src_clip",
          arrangementStart: "5|1",
          takeLane: 1,
        }),
      ).rejects.toThrow(REASON);

      expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
      expectNoNotesApiCalls(source);
    });

    it("onto a take lane beside a main-lane copy, which still lands", async () => {
      registerLiveSet();
      registerArrangementSource(true);
      typed("src_clip", "step-sequencer");
      const laneTrack = registerTakeLaneTrack({
        trackIndex: 3,
        initialLanes: 1,
      });
      const mainTrack = registerTrackWithArrangementDup(2);

      registerArrangementClip(2, 0, 0);

      const result = await duplicate({
        type: "clip",
        id: "src_clip",
        toPath: "t3/l0,t2",
        arrangementStart: "9|1,1|1",
      });

      expect(mainTrack.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id src_clip",
        0,
      );
      expect(laneTrack.call).not.toHaveBeenCalledWith("create_take_lane");
      expect(result).toStrictEqual([
        { path: "t3/l0[9|1]", ok: false, detail: REASON },
        { id: livePath.track(2).arrangementClip(0), path: "t2[1|1]" },
      ]);
    });

    it("from a take lane onto the main lane", async () => {
      registerLiveSet();
      const track = registerTakeLaneTrack({ initialLanes: 1 });

      registerTakeLaneSource();
      typed("tl_src_clip", "step-sequencer");

      await expect(
        duplicate({ type: "clip", id: "tl_src_clip", arrangementStart: "5|1" }),
      ).rejects.toThrow(REASON);

      expect(track.call).not.toHaveBeenCalledWith(
        "create_midi_clip",
        expect.anything(),
        expect.anything(),
      );
    });

    it("from an arrangement clip into a clip slot: no scene made, nothing created", async () => {
      mockNonExistentObjects();
      registerMockObject("arr_clip", {
        path: livePath.track(0).arrangementClip(0),
        type: "Clip",
        properties: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          length: 4,
          loop_end: 4,
          end_marker: 4,
          signature_numerator: 4,
          signature_denominator: 4,
        },
        methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
      });
      typed("arr_clip", "step-sequencer");
      const slot = registerMockObject("slot", {
        path: livePath.track(1).clipSlot(0),
        properties: { has_clip: 0 },
      });
      const track = registerMockObject("track-1", {
        path: livePath.track(1),
        properties: { has_midi_input: 1, is_frozen: 0 },
      });

      await expect(
        duplicate({ type: "clip", id: "arr_clip", toPath: "t1/s0" }),
      ).rejects.toThrow(REASON);

      expect(slot.call).not.toHaveBeenCalled();
      expect(track.call).not.toHaveBeenCalled();
    });
  });

  describe("a track's clips copied onto a lane", () => {
    it("skips the step sequencer clip and still copies the notes clip", async () => {
      registerMainLaneSource([0, 16]);
      typed("src_clip_0", "step-sequencer");
      typed("src_clip_1", "notes");
      const destination = registerTakeLaneTrack({ trackIndex: 1 });

      const result = await duplicateToLanes<LaneCopyEntry>({
        id: "src_track",
        toPath: "t1/l0",
      });

      expect(result.clips).toStrictEqual([
        { path: "t1/l0[1|1]", ok: false, detail: REASON },
        expect.objectContaining({ path: "t1/l0[5|1]" }),
      ]);
      expect(destination.call).toHaveBeenCalledWith("create_take_lane");
      expectNoNotesApiCalls(
        lookupMockObject("src_clip_0") as RegisteredMockObject,
      );
    });

    it("refuses the call, making no lane, when every clip is a step sequencer clip", async () => {
      registerMainLaneSource([0, 16]);
      typed("src_clip_0", "step-sequencer");
      typed("src_clip_1", "step-sequencer");
      const destination = registerTakeLaneTrack({ trackIndex: 1 });

      await expect(
        duplicateToLanes({ id: "src_track", toPath: "t1/l0" }),
      ).rejects.toThrow(
        "no clip a lane copy can re-create: each is a step sequencer clip",
      );
      expect(destination.call).not.toHaveBeenCalledWith("create_take_lane");
    });
  });

  describe.each<[MidiClipEra, string]>([
    ["notes", "a Live 13 notes clip"],
    ["live-12", "a Live 12 clip"],
  ])("on %s (%s) the same copy re-creates it, as before", (era) => {
    it("onto a take lane", async () => {
      registerLiveSet();
      registerArrangementSource(true);
      typed("src_clip", era);
      const track = registerTakeLaneTrack({ initialLanes: 0 });

      const result = await duplicate({
        type: "clip",
        id: "src_clip",
        arrangementStart: "5|1",
        takeLane: 1,
      });

      expect(track.call).toHaveBeenCalledWith("create_take_lane");
      expect(result).toStrictEqual(
        expect.objectContaining({ detail: "re-created on the take lane" }),
      );
    });

    it("onto the main lane from a take lane", async () => {
      registerLiveSet();
      registerTakeLaneTrack({ initialLanes: 1 });
      registerTakeLaneSource();
      typed("tl_src_clip", era);

      const result = await duplicate({
        type: "clip",
        id: "tl_src_clip",
        arrangementStart: "5|1",
      });

      expect(result).toStrictEqual(
        expect.objectContaining({
          detail: "promoted to the main lane by re-creating it",
        }),
      );
    });
  });
});
