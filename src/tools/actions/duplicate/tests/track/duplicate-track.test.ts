// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  createTrackResult,
  expectDeleteDeviceCalls,
  registerBareTrackDuplication,
  registerDuplicatedTrackSlots,
  registerMockObject,
  registerPendingMockObject,
  type RegisteredMockObject,
  registerTrackCopySet,
  setupProducerPalDeviceMocks,
  setupRouteToSourceMock,
  setupRoutingMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/** What a track copy the deadline never reached answers with. */
const OUT_OF_TIME_SKIP = {
  id: "track1",
  ok: false,
  detail: "the request ran out of time; re-run for this copy",
};

describe("duplicate - track duplication", () => {
  it("should duplicate a single track (default count)", async () => {
    const { liveSet } = registerBareTrackDuplication();

    const result = await duplicate({ type: "track", id: "track1" });

    expect(result).toStrictEqual(createTrackResult(1));
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);
  });

  it("should duplicate multiple tracks with same name", async () => {
    const { liveSet, tracks } = registerTrackCopySet(["track1"]);

    const result = await duplicate({
      type: "track",
      id: "track1",
      count: 3,
      name: "Custom Track",
    });

    expect(result).toStrictEqual([
      { id: "copy-3", path: "t1", clips: [] },
      { id: "copy-2", path: "t2", clips: [] },
      { id: "copy-1", path: "t3", clips: [] },
    ]);
    // Every copy is made from the source, never from the copy before it.
    expect(liveSet.call).toHaveBeenCalledTimes(3);

    for (const n of [1, 2, 3]) {
      expect(liveSet.call).toHaveBeenNthCalledWith(n, "duplicate_track", 0);
    }

    for (const id of ["copy-1", "copy-2", "copy-3"]) {
      expect(tracks.get(id)?.set).toHaveBeenCalledWith("name", "Custom Track");
    }
  });

  it("should duplicate a track without clips when withoutClips is true", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    registerMockObject("live_set", { path: livePath.liveSet });
    const { newTrack, slots } = registerDuplicatedTrackSlots(
      [true, false, true],
      ["arrangementClip0", "arrangementClip1"],
    );

    const result = await duplicate({
      type: "track",
      id: "track1",
      withoutClips: true,
    });

    expect(result).toStrictEqual(createTrackResult(1));

    // Verify delete_clip was called for session clips with has_clip
    expect(slots[0]!.call).toHaveBeenCalledWith("delete_clip");
    expect(slots[2]!.call).toHaveBeenCalledWith("delete_clip");

    // Verify delete_clip was called for arrangement clips (on track with clip IDs)
    expect(newTrack.call).toHaveBeenCalledWith(
      "delete_clip",
      "id arrangementClip0",
    );
    expect(newTrack.call).toHaveBeenCalledWith(
      "delete_clip",
      "id arrangementClip1",
    );
  });

  it("should collect session clips when duplicating a track with clips", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerDuplicatedTrackSlots([true, false]);
    // The clip inside slot0, resolved via clipSlot.child("clip")
    registerPendingMockObject("live_set/tracks/1/clip_slots/0/clip", {
      path: livePath.track(1).clipSlot(0).clip(),
      properties: { is_arrangement_clip: 0 },
    });

    const result = await duplicate({ type: "track", id: "track1" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1",
      path: "t1",
      clips: [{ id: "live_set/tracks/1/clip_slots/0/clip", path: "t1/s0" }],
    });
  });

  // Live hands back an id list, not objects: an entry that resolves to nothing
  // has no clip to report, and reporting it would invent one.
  it("leaves out an arrangement clip id that resolves to nothing", async () => {
    mockNonExistentObjects();
    registerMockObject("track1", { path: livePath.track(0) });
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    registerDuplicatedTrackSlots([], ["arrClip0", "ghostClip"]);
    registerPendingMockObject("arrClip0", {
      path: livePath.track(1).arrangementClip(0),
      properties: { is_arrangement_clip: 1, start_time: 0 },
    });

    const result = await duplicate({ type: "track", id: "track1" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1",
      path: "t1",
      clips: [{ id: "arrClip0", path: "t1[1|1]" }],
    });
  });

  it("should duplicate a track without devices when withoutDevices is true", async () => {
    const { liveSet, newTrack } = setupProducerPalDeviceMocks();

    const result = await duplicate({
      type: "track",
      id: "track1",
      withoutDevices: true,
    });

    expect(result).toStrictEqual(createTrackResult(1));
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);
    expectDeleteDeviceCalls(newTrack, 3);
  });

  it.each([
    ["withoutDevices not specified", undefined],
    ["withoutDevices is false", false],
  ] as const)(
    "should duplicate a track with devices when %s",
    async (_desc: string, withoutDevices: boolean | undefined) => {
      registerMockObject("track1", { path: livePath.track(0) });
      const liveSet = registerMockObject("live_set", {
        path: livePath.liveSet,
      });
      const newTrack = registerPendingMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: {
          devices: children("device0", "device1"),
          clip_slots: [],
          arrangement_clips: [],
        },
      });

      const result = await duplicate({
        type: "track",
        id: "track1",
        ...(withoutDevices !== undefined && { withoutDevices }),
      });

      expect(result).toStrictEqual(createTrackResult(1));
      expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);

      // Verify delete_device was NOT called
      expect(newTrack.call).not.toHaveBeenCalledWith(
        "delete_device",
        expect.anything(),
      );
    },
  );

  it("should remove Producer Pal device when duplicating host track", async () => {
    const { liveSet, newTrack } = setupProducerPalDeviceMocks();

    const result = await duplicate({
      type: "track",
      id: "track1",
    });

    expect(result).toStrictEqual({
      ...createTrackResult(1),
      detail: "the Producer Pal device was not copied",
    });
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);

    // Verify delete_device was called to remove Producer Pal device
    expect(newTrack.call).toHaveBeenCalledWith(
      "delete_device",
      1, // Index 1 where the Producer Pal device is
    );
    // The copy's entry carries it, so nothing warns about it.
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("should not remove Producer Pal device when withoutDevices is true", async () => {
    const { newTrack } = setupProducerPalDeviceMocks();

    const result = await duplicate({
      type: "track",
      id: "track1",
      withoutDevices: true,
    });

    expect(result).toStrictEqual(createTrackResult(1));

    // Verify delete_device was called 3 times (once for each device)
    // but NOT specifically for Producer Pal before the withoutDevices logic
    const deleteDeviceCalls = newTrack.call.mock.calls.filter(
      (call: unknown[]) => call[0] === "delete_device",
    );

    expect(deleteDeviceCalls).toHaveLength(3);
  });

  describe("routeToSource functionality", () => {
    it("refuses routeToSource on a non-track type", async () => {
      await expect(
        duplicate({ type: "scene", id: "scene1", routeToSource: true }),
      ).rejects.toThrow(
        'routeToSource is only for type "track"; this call has type "scene". Change the type or drop routeToSource.',
      );
    });

    it("should configure routing when routeToSource is true", async () => {
      const { sourceTrack, newTrack } = setupRoutingMocks({
        monitoringState: 1,
        inputRoutingName: "Audio In",
      });

      const result = await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      expect(result).toStrictEqual({
        ...createTrackResult(1),
        detail:
          'source track t0 (id live_set/tracks/0): set its input to "No Input"',
      });

      // Source input was "Audio In" (not "No Input"), so it is switched to the
      // "No Input" routing type and the change is reported.
      expect(sourceTrack.set).toHaveBeenCalledWith(
        "input_routing_type",
        JSON.stringify({ input_routing_type: { identifier: "no_input_id" } }),
      );

      // New track output is routed to the (single-name-match) source track.
      expect(newTrack.set).toHaveBeenCalledWith(
        "output_routing_type",
        JSON.stringify({
          output_routing_type: { identifier: "source_track_id" },
        }),
      );
    });

    it("routes output to an all-digit-named source track", async () => {
      // getProperty("name") reports an all-digit source name as a number,
      // which used to never match Live's string display_name — output
      // routing silently never landed, blaming a type mismatch on Live.
      const { newTrack } = setupRoutingMocks({
        trackName: 5678,
        monitoringState: 1,
        inputRoutingName: "Audio In",
      });

      await duplicate({ type: "track", id: "track1", routeToSource: true });

      expect(newTrack.set).toHaveBeenCalledWith(
        "output_routing_type",
        JSON.stringify({
          output_routing_type: { identifier: "source_track_id" },
        }),
      );
    });

    it("warns when the source track name is absent from the output routing options", async () => {
      // newTrack advertises only "Master" as an output — the source name has no
      // match, so no output routing is applied and the miss is reported.
      registerMockObject("track1", { path: livePath.track(0) });
      registerMockObject("live_set", { path: livePath.liveSet });
      registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
        properties: {
          name: "Source Track",
          // Already "No Input" so the input-routing branch is skipped; JSON
          // string form matches what getProperty() parses.
          input_routing_type: JSON.stringify({
            input_routing_type: { display_name: "No Input" },
          }),
          arm: 1,
        },
      });
      const newTrack = registerPendingMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: {
          available_output_routing_types: JSON.stringify({
            available_output_routing_types: [
              { display_name: "Master", identifier: "master_id" },
            ],
          }),
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
        },
      });

      const result = (await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      })) as { detail?: string };

      expect(newTrack.set).not.toHaveBeenCalledWith(
        "output_routing_type",
        expect.anything(),
      );
      expect(result.detail).toBe(
        'not routed to the source: no output option named "Source Track"',
      );
      // The copy's entry carries it, so nothing warns about it.
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("should not change source track monitoring if already set to In", async () => {
      const { sourceTrack } = setupRoutingMocks();

      await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify monitoring was NOT changed
      expect(sourceTrack.set).not.toHaveBeenCalledWith(
        "current_monitoring_state",
        expect.anything(),
      );
    });

    it("should not change source track input routing if already set to No Input", async () => {
      const { sourceTrack } = setupRoutingMocks();

      await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify input routing was NOT changed (setProperty calls this.set for routing)
      expect(sourceTrack.set).not.toHaveBeenCalledWith(
        "input_routing_type",
        expect.anything(),
      );
    });

    it("should override withoutClips to true when routeToSource is true", async () => {
      setupRoutingMocks();

      const result = await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
        withoutClips: false, // This should be overridden
      });

      expect(result).toStrictEqual({
        path: "t1",
        id: expect.any(String),
        clips: [],
      });
    });

    it("should override withoutDevices to true when routeToSource is true", async () => {
      setupRoutingMocks();

      const result = await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
        withoutDevices: false, // This should be overridden
      });

      expect(result).toStrictEqual({
        path: "t1",
        id: expect.any(String),
        clips: [],
      });
    });

    /**
     * Duplicates track1 with routeToSource, with the source armed or not.
     * @param arm - Whether the source starts armed (1) or not (0)
     * @returns The source track mock and the copy's detail
     */
    async function duplicateRoutedToSource(
      arm: number,
    ): Promise<{ sourceTrack: RegisteredMockObject; detail?: string }> {
      const { sourceTrack } = setupRoutingMocks({
        inputRoutingName: "Audio In",
        arm,
      });

      const result = (await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      })) as { detail?: string };

      return { sourceTrack, detail: result.detail };
    }

    it("should arm the source track when routeToSource is true", async () => {
      const { sourceTrack, detail } = await duplicateRoutedToSource(0);

      // Verify the source track was armed
      expect(sourceTrack.set).toHaveBeenCalledWith("arm", 1);

      // It wasn't already armed, so the arm action is reported.
      expect(detail).toContain("armed it");
    });

    it("does not report arming a source track that was already armed", async () => {
      const { sourceTrack, detail } = await duplicateRoutedToSource(1);

      // Verify the source track was still set to armed (even though it already was)
      expect(sourceTrack.set).toHaveBeenCalledWith("arm", 1);
      expect(detail).not.toContain("armed it");
    });
  });

  it("reports the palette color Live snapped a track copy's color to", async () => {
    const { newTrack } = registerBareTrackDuplication();

    newTrack.get.mockImplementation((prop: string) =>
      prop === "color" ? [16725558] : [0],
    );

    expect(
      await duplicate({ type: "track", id: "track1", color: "#FF0000" }),
    ).toStrictEqual({
      ...createTrackResult(1),
      color: "#FF3636",
      detail: "color #FF0000 is not in Live's palette; landed as #FF3636",
    });
  });

  it("should apply color when duplicating a track", async () => {
    const { newTrack } = registerBareTrackDuplication();

    const result = await duplicate({
      type: "track",
      id: "track1",
      color: "#ff0000",
    });

    expect(result).toStrictEqual(createTrackResult(1));
    expect(newTrack.set).toHaveBeenCalledWith("color", 0xff0000);
  });

  it("stops at the request deadline and says how far it got", async () => {
    // The deadline arrives on the context, set once per request by the V8
    // adapter; an expired one is what a duplicate sees when an earlier call in
    // the same request has spent the budget.
    registerMockObject("track1", { path: livePath.track(0) });

    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    const result = await duplicate(
      { type: "track", id: "track1", count: 3 },
      { deadline: Date.now() - 1 },
    );

    // Every copy it never made keeps its slot.
    expect(result).toStrictEqual(
      Array.from({ length: 3 }, () => ({ ...OUT_OF_TIME_SKIP })),
    );
    expect(liveSet.call).not.toHaveBeenCalledWith("duplicate_track", 0);
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("Ran out of time"),
    );
  });
});

describe("duplicate - several copies of one track", () => {
  it("routes the copies only once all of them exist", async () => {
    const { liveSet } = registerTrackCopySet(["track1"]);
    const routing = setupRouteToSourceMock({ inputRoutingName: "Audio In" });
    const source = registerMockObject("track1", {
      path: livePath.track(0),
      properties: {
        ...routing[String(livePath.track(0))],
        devices: [],
        clip_slots: [],
        arrangement_clips: [],
      },
    });

    await duplicate({
      type: "track",
      id: "track1",
      count: 2,
      routeToSource: true,
    });

    // Routing takes the source's input away, and a copy made after that would
    // come out with no input.
    const lastCopy = Math.max(...liveSet.call.mock.invocationCallOrder);
    const firstSourceWrite = Math.min(...source.set.mock.invocationCallOrder);

    expect(source.set).toHaveBeenCalledWith(
      "input_routing_type",
      expect.stringContaining("no_input_id"),
    );
    expect(firstSourceWrite).toBeGreaterThan(lastCopy);
  });

  // Copies are made last to first, so the one the deadline spared is the last
  // named, and it takes the last name.
  it("keeps each name with the copy it was meant for when the deadline stops some", async () => {
    const context = { deadline: Date.now() + 60_000 };
    const { liveSet, tracks } = registerTrackCopySet(["track1"]);
    const copyTrack = liveSet.methods.duplicate_track!;

    liveSet.methods.duplicate_track = (...args: unknown[]) => {
      context.deadline = Date.now() - 1;

      return copyTrack(...args);
    };

    const result = await duplicate(
      { type: "track", id: "track1", count: 2, name: "A,B" },
      context,
    );

    expect(result).toStrictEqual([
      OUT_OF_TIME_SKIP,
      { id: "copy-1", path: "t1", clips: [] },
    ]);
    expect(tracks.get("copy-1")?.set).toHaveBeenCalledWith("name", "B");
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("Ran out of time"),
    );
  });

  it("reports each copy's clips on the track the copy ended up on", async () => {
    const { liveSet } = registerTrackCopySet(["track1"]);
    const copyTrack = liveSet.methods.duplicate_track!;
    let made = 0;

    // Give each copy a clip in its first slot as it lands at t1.
    liveSet.methods.duplicate_track = (...args: unknown[]) => {
      copyTrack(...args);
      made++;

      const slot = livePath.track(1).clipSlot(0);

      registerMockObject(`copy-${made}`, {
        path: livePath.track(1),
        properties: {
          devices: [],
          clip_slots: children(`slot-${made}`),
          arrangement_clips: [],
        },
      });
      registerMockObject(`slot-${made}`, {
        path: slot,
        properties: { has_clip: 1 },
      });
      registerMockObject(`clip-${made}`, {
        path: slot.clip(),
        properties: { is_arrangement_clip: 0 },
      });

      return null;
    };

    const result = await duplicate({ type: "track", id: "track1", count: 2 });

    expect(result).toStrictEqual([
      { id: "copy-2", path: "t1", clips: [{ id: "clip-2", path: "t1/s0" }] },
      { id: "copy-1", path: "t2", clips: [{ id: "clip-1", path: "t2/s0" }] },
    ]);
  });
});

describe("duplicate - a track copy that fails", () => {
  it("keeps the copies around it, and the failed one's place", async () => {
    const { tracks } = registerTrackCopySet(["track1"], undefined, [3]);

    const result = await duplicate({
      type: "track",
      id: "track1",
      count: 3,
      name: "A,B,C",
    });

    // The copies are made last to first, so the third attempt is the first
    // named, which gets "A".
    expect(result).toStrictEqual([
      { id: "track1", ok: false, detail: "Live made no copy of t0" },
      { id: "copy-2", path: "t1", clips: [] },
      { id: "copy-1", path: "t2", clips: [] },
    ]);
    expect(tracks.get("copy-2")?.set).toHaveBeenCalledWith("name", "B");
    expect(tracks.get("copy-1")?.set).toHaveBeenCalledWith("name", "C");
  });

  it("still tries the copies after it", async () => {
    registerTrackCopySet(["track1"], undefined, [1]);

    const result = await duplicate({ type: "track", id: "track1", count: 2 });

    expect(result).toStrictEqual([
      { id: "copy-1", path: "t1", clips: [] },
      { id: "track1", ok: false, detail: "Live made no copy of t0" },
    ]);
  });

  it("adds no toPath note to it", async () => {
    registerTrackCopySet(["track1"], undefined, [2]);

    const result = await duplicate({
      type: "track",
      id: "track1",
      count: 2,
      toPath: "t5",
    });

    expect(result).toStrictEqual([
      { id: "track1", ok: false, detail: "Live made no copy of t0" },
      expect.objectContaining({ id: "copy-1", path: "t1" }),
    ]);
  });

  it("reports every copy when none landed", async () => {
    registerTrackCopySet(["track1"], undefined, [1, 2]);

    const result = await duplicate({ type: "track", id: "track1", count: 2 });

    expect(result).toStrictEqual([
      { id: "track1", ok: false, detail: "Live made no copy of t0" },
      { id: "track1", ok: false, detail: "Live made no copy of t0" },
    ]);
  });

  it("fails a lone copy with its reason", async () => {
    registerTrackCopySet(["track1"], undefined, [1]);

    await expect(duplicate({ type: "track", id: "track1" })).rejects.toThrow(
      "Live made no copy of t0",
    );
  });
});
