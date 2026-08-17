// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import {
  clearClipAtDuplicateTargetMock,
  duplicateSelfOverlappingClipMock,
} from "../setup.ts";
import { toolDefDuplicate } from "#src/tools/actions/duplicate/duplicate.def.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerArrangementClip,
  registerMockObject,
  registerSessionClipDuplication,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

describe("duplicate - clip duplication", () => {
  it("should throw an error when clip has no position params", async () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
    });
    await expect(duplicate({ type: "clip", id: "clip1" })).rejects.toThrow(
      'duplicate failed: clip requires toPath ("t0/s1" for a session slot) or arrangementStart/locator (for the arrangement)',
    );
  });

  describe("session destination", () => {
    it("should duplicate a single clip to the session view", async () => {
      const { sourceClipSlot } = registerSessionClipDuplication({
        destClipProperties: {},
      });

      const result = await duplicate({
        type: "clip",
        id: "clip1",

        toSlot: "0/1",
      });

      expect(sourceClipSlot.call).toHaveBeenCalledWith(
        "duplicate_clip_to",
        "id live_set/tracks/0/clip_slots/1",
      );

      expect(result).toStrictEqual({
        id: "live_set/tracks/0/clip_slots/1/clip",
        path: "t0/s1",
      });
    });

    it("should duplicate multiple clips to session view with comma-separated toSceneIndex", async () => {
      const { sourceClipSlot } = registerSessionClipDuplication();

      registerMockObject("live_set/tracks/0/clip_slots/2", {
        path: livePath.track(0).clipSlot(2),
        properties: { has_clip: 0 },
      });

      const destClip1 = registerMockObject(
        "live_set/tracks/0/clip_slots/1/clip",
        {
          path: livePath.track(0).clipSlot(1).clip(),
        },
      );

      const destClip2 = registerMockObject(
        "live_set/tracks/0/clip_slots/2/clip",
        {
          path: livePath.track(0).clipSlot(2).clip(),
        },
      );

      const result = await duplicate({
        type: "clip",
        id: "clip1",

        name: "Custom Clip",
        toSlot: "0/1, 0/2",
      });

      expect(result).toStrictEqual([
        {
          id: "live_set/tracks/0/clip_slots/1/clip",
          path: "t0/s1",
        },
        {
          id: "live_set/tracks/0/clip_slots/2/clip",
          path: "t0/s2",
        },
      ]);

      expect(sourceClipSlot.call).toHaveBeenCalledWith(
        "duplicate_clip_to",
        "id live_set/tracks/0/clip_slots/1",
      );
      expect(sourceClipSlot.call).toHaveBeenCalledWith(
        "duplicate_clip_to",
        "id live_set/tracks/0/clip_slots/2",
      );

      expect(destClip1.set).toHaveBeenCalledWith("name", "Custom Clip");
      expect(destClip2.set).toHaveBeenCalledWith("name", "Custom Clip");
    });

    it("takes the same slot from toPath", async () => {
      const { sourceClipSlot } = registerSessionClipDuplication({
        destClipProperties: {},
      });

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        toPath: "t0/s1",
      });

      expect(sourceClipSlot.call).toHaveBeenCalledWith(
        "duplicate_clip_to",
        "id live_set/tracks/0/clip_slots/1",
      );
      expect(result).toStrictEqual({
        id: "live_set/tracks/0/clip_slots/1/clip",
        path: "t0/s1",
      });
    });

    it("refuses when toPath and toSlot both name a destination", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });

      await expect(
        duplicate({
          type: "clip",
          id: "clip1",
          toPath: "t0/s1",
          toSlot: "0/2",
        }),
      ).rejects.toThrow(/toPath and toSlot both name a destination/);
    });

    it("should throw an error when trying to duplicate an arrangement clip to session", async () => {
      registerMockObject("arrangementClip1", {
        path: livePath.track(0).arrangementClip(0),
      });

      await expect(
        duplicate({
          type: "clip",
          id: "arrangementClip1",

          toSlot: "1/2",
        }),
      ).rejects.toThrow(
        'unsupported duplicate operation: cannot duplicate arrangement clips to the session (source clip id="arrangementClip1" path="live_set tracks 0 arrangement_clips 0") ',
      );
    });
  });

  describe("arrangement destination", () => {
    it("should duplicate a single clip to the arrangement view", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });

      const track0 = registerTrackWithArrangementDup(0);

      registerArrangementClip(0, 0, 8);

      const result = await duplicate({
        type: "clip",
        id: "clip1",

        arrangementStart: "3|1",
      });

      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );

      expect(result).toStrictEqual({
        id: livePath.track(0).arrangementClip(0),
        path: "t0",
        arrangementStart: "3|1",
      });
    });

    it("places the copy on toPath's track instead of the source's own", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });

      const track0 = registerTrackWithArrangementDup(0);
      const track2 = registerTrackWithArrangementDup(2, { has_midi_input: 1 });

      registerArrangementClip(2, 0, 8);

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "3|1",
        toPath: "t2",
      });

      // The destination track receives the call; the source's track is untouched
      // — the whole point, since duplicating onto the source's own track at the
      // source's position overwrites it.
      expect(track2.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );
      expect(track0.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.anything(),
        expect.anything(),
      );

      expect(result).toStrictEqual({
        id: livePath.track(2).arrangementClip(0),
        path: "t2",
        arrangementStart: "3|1",
      });
    });

    it("cycles one position across several toPath tracks", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });

      const track2 = registerTrackWithArrangementDup(2, { has_midi_input: 1 });
      const track3 = registerTrackWithArrangementDup(3, { has_midi_input: 1 });

      registerArrangementClip(2, 0, 8);
      registerArrangementClip(3, 0, 8);

      // Two tracks, one position: the shorter list cycles, so the copy count is
      // the longer of the two.
      const result = await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "3|1",
        toPath: "t2,t3",
      });

      expect(track2.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );
      expect(track3.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );

      expect(result).toStrictEqual([
        {
          id: livePath.track(2).arrangementClip(0),
          path: "t2",
          arrangementStart: "3|1",
        },
        {
          id: livePath.track(3).arrangementClip(0),
          path: "t3",
          arrangementStart: "3|1",
        },
      ]);
    });

    it("cycles one toPath track across several positions", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });

      const track2 = registerTrackWithArrangementDup(2, { has_midi_input: 1 });

      registerArrangementClip(2, 0, 8);
      registerArrangementClip(2, 1, 16);

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "3|1,5|1",
        toPath: "t2",
      });

      expect(track2.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );
      expect(track2.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        16,
      );
      expect(result).toHaveLength(2);
    });

    // 3 positions over 2 tracks doesn't divide, and the shorter list has to
    // cycle PAST its end (t2, t3, t2) rather than run out at two copies.
    it("cycles tracks past the end when the two counts don't divide", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });

      registerTrackWithArrangementDup(2, { has_midi_input: 1 });
      registerTrackWithArrangementDup(3, { has_midi_input: 1 });
      registerArrangementClip(2, 0, 8);
      registerArrangementClip(2, 1, 24);
      registerArrangementClip(3, 0, 16);

      const result = (await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "3|1,5|1,7|1",
        toPath: "t2,t3",
      })) as Array<{ path: string; arrangementStart: string }>;

      expect(
        result.map((copy) => [copy.path, copy.arrangementStart]),
      ).toStrictEqual([
        ["t2", "3|1"],
        ["t3", "5|1"],
        ["t2", "7|1"],
      ]);
    });

    it("rejects a bare track in toPath with no position, naming both options", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });

      await expect(
        duplicate({ type: "clip", id: "clip1", toPath: "t2" }),
      ).rejects.toThrow(/"t2" names a track but not a spot on it/);
    });

    // A session position and an arrangement position are different places, and
    // toPath is the one that says where. Warn and make the session copy rather
    // than failing the call.
    it("ignores arrangementStart when toPath names a session slot", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { trackIndex: 0, sceneIndex: 0 },
      });
      registerMockObject("clipslot-2-0", {
        path: livePath.track(2).clipSlot(0),
      });

      await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "3|1",
        toPath: "t2/s0",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("arrangementStart/locator ignored"),
      );
    });

    // The point of parsing paths before touching Live: a list whose last entry
    // is malformed must not leave copies from the earlier entries behind.
    it("creates nothing when a later toPath entry is malformed", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });

      const track2 = registerTrackWithArrangementDup(2, { has_midi_input: 1 });

      await expect(
        duplicate({
          type: "clip",
          id: "clip1",
          arrangementStart: "3|1",
          toPath: "t2, nonsense",
        }),
      ).rejects.toThrow(/"nonsense" is not a track/);

      expect(track2.call).not.toHaveBeenCalled();
    });

    // An empty toPath list means "the source clip's own track" downstream, which
    // is the overwrite-the-source failure toPath exists to prevent.
    it("creates nothing for a toPath that was sent but names nothing", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });

      const track0 = registerTrackWithArrangementDup(0, { has_midi_input: 1 });

      await expect(
        duplicate({
          type: "clip",
          id: "clip1",
          arrangementStart: "3|1",
          toPath: ",",
        }),
      ).rejects.toThrow(/toPath "," - it names no destination/);

      expect(track0.call).not.toHaveBeenCalled();
    });

    // Same failure as ",": toPath was sent, names nothing, and reading it as
    // omitted puts the copy on the source's own track without a word.
    it("creates nothing for a toPath sent as null", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });

      const track0 = registerTrackWithArrangementDup(0, { has_midi_input: 1 });
      // z.coerce.string() runs before the handler, so a JSON null arrives as "null"
      const toPath = toolDefDuplicate.toolOptions.inputSchema.toPath?.parse(
        null,
      ) as string;

      expect(toPath).toBe("null");

      await expect(
        duplicate({
          type: "clip",
          id: "clip1",
          arrangementStart: "3|1",
          toPath,
        }),
      ).rejects.toThrow('invalid toPath "null" - "null" is not a track');

      expect(track0.call).not.toHaveBeenCalled();
    });

    it("copies to the toSlot and drops the arrangement position, with a warning", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });

      await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "3|1",
        toSlot: "2/0",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining(
          "arrangementStart/locator ignored — toSlot names a session position",
        ),
      );
    });

    it("skips a silent duplicate failure (Ableton returns ['id', 0]) without a phantom clip", async () => {
      // Regression (#21): the no-length arrangement-duplicate path pushed a
      // phantom clip when Ableton silently failed the dup (["id", 0]), unlike its
      // siblings in arrangement-tiling and update-clip which guard with exists().
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });

      // Same shape as registerTrackWithArrangementDup, but the dup silently fails.
      registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
        methods: { duplicate_clip_to_arrangement: () => ["id", 0] },
      });

      registerArrangementClip(0, 0, 8);

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "3|1",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("Failed to duplicate clip"),
      );
      expect(result).toStrictEqual({ trackIndex: 0, clips: [] });
    });

    it("skips a silent duplicate failure on the with-length path too (no phantom clip)", async () => {
      // Sibling of the no-length guard above: the arrangementLength path
      // (createClipsForLength, Case 2) read newClip.id and proceeded to
      // lengthen/label it without an exists() check. A silent dup (["id", 0])
      // must skip here as well rather than push a phantom clip.
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: {
          length: 4,
          looping: 1,
          is_midi_clip: 1,
          signature_numerator: 4,
          signature_denominator: 4,
          loop_start: 0,
          loop_end: 4,
        },
      });

      registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
        methods: { duplicate_clip_to_arrangement: () => ["id", 0] },
      });
      registerMockObject("live_set", { path: livePath.liveSet });

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "3|1",
        arrangementLength: "1bar", // 4 beats == clip length → Case 2 (exact)
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("Failed to duplicate clip"),
      );
      expect(result).toStrictEqual({ trackIndex: 0, clips: [] });
    });

    it("routes a self-overlapping duplicate through the holding area instead of skipping", async () => {
      // When the source overlaps its own target, clearClipAtDuplicateTarget
      // reports false. The duplicate must route through duplicateSelfOverlappingClip
      // (holding-area copy → overwrite the original) and return the placed copy —
      // it must NOT skip with an empty result.
      clearClipAtDuplicateTargetMock.mockReturnValueOnce(false);

      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });
      registerTrackWithArrangementDup(0);

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "3|1",
      });

      expect(duplicateSelfOverlappingClipMock).toHaveBeenCalled();
      expect(result).toMatchObject({ path: "t0", arrangementStart: "3|1" });
    });

    it("rejects a 0-indexed arrangementStart with the 1-indexing steer", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });
      registerTrackWithArrangementDup(0);
      registerArrangementClip(0, 0, 8);

      // Parity with create-clip: a 0-indexed/zero-bar arrangement start is a
      // hard error, not a silent pre-origin beat. Also covers the per-item check
      // in a comma-separated list (the bad position is the second one).
      await expect(
        duplicate({ type: "clip", id: "clip1", arrangementStart: "1|0" }),
      ).rejects.toThrow(/1-indexed/);
      await expect(
        duplicate({ type: "clip", id: "clip1", arrangementStart: "3|1,1|0" }),
      ).rejects.toThrow(/1-indexed/);
    });

    it("should duplicate multiple clips to arrangement view with comma-separated positions", async () => {
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });

      const track0 = registerTrackWithArrangementDup(0);

      registerArrangementClip(0, 0, 8);
      registerArrangementClip(0, 1, 12);
      registerArrangementClip(0, 2, 16);

      const result = await duplicate({
        type: "clip",
        id: "clip1",

        arrangementStart: "3|1,4|1,5|1",
        name: "Custom Clip",
      });

      expect(result).toStrictEqual([
        {
          id: livePath.track(0).arrangementClip(0),
          path: "t0",
          arrangementStart: "3|1",
        },
        {
          id: livePath.track(0).arrangementClip(1),
          path: "t0",
          arrangementStart: "4|1",
        },
        {
          id: livePath.track(0).arrangementClip(2),
          path: "t0",
          arrangementStart: "5|1",
        },
      ]);

      // Clips should be placed at explicit positions
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        12,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        16,
      );
      expect(track0.call).toHaveBeenCalledTimes(3); // 3 duplicates
    });

    it("names the positions a cut-short duplicate did not reach", async () => {
      // The deadline arrives on the context, set once per request by the V8
      // adapter; an expired one is what a duplicate sees when an earlier call
      // in the same request has spent the budget.
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });

      const track0 = registerTrackWithArrangementDup(0);

      registerArrangementClip(0, 0, 8);

      const result = await duplicate(
        { type: "clip", id: "clip1", arrangementStart: "3|1,4|1,5|1" },
        { deadline: Date.now() - 1 },
      );

      expect(result).toStrictEqual([]);
      expect(track0.call).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        "Ran out of time after duplicating 0 of 3. " +
          "Not duplicated: t0 3|1, t0 4|1, t0 5|1. Re-run for those positions.",
      );
    });

    it("names the track of each copy a cut-short fan-out did not reach", async () => {
      // One position across several tracks: without the track, the warning is
      // the same position three times and a caller re-runs tracks that finished.
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });

      registerTrackWithArrangementDup(1, { has_midi_input: 1 });
      registerTrackWithArrangementDup(2, { has_midi_input: 1 });
      registerTrackWithArrangementDup(3, { has_midi_input: 1 });

      await duplicate(
        {
          type: "clip",
          id: "clip1",
          arrangementStart: "3|1",
          toPath: "t1,t2,t3",
        },
        { deadline: Date.now() - 1 },
      );

      expect(outlet).toHaveBeenCalledWith(
        1,
        "Ran out of time after duplicating 0 of 3. " +
          "Not duplicated: t1 3|1, t2 3|1, t3 3|1. Re-run for those positions.",
      );
    });
  });
});
