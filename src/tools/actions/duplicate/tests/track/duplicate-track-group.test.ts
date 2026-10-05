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
  expectDeleteDeviceCalls,
  registerClipSlot,
  registerMockObject,
  type RegisteredMockObject,
  registerTrackCopySet,
  type TrackCopySet,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

/**
 * t0 is a group holding t1; t2 is a plain track after it.
 * @returns The Live Set and its tracks
 */
function groupWithOneMember(): TrackCopySet {
  return registerTrackCopySet(["group", "member", "other"], {
    index: 0,
    members: 1,
  });
}

/**
 * Give the first copy's member (landing at t3) two devices, a session clip
 * and an arrangement clip.
 * @param tracks - The Set's tracks, from groupWithOneMember()
 * @returns The member copy's clip slot
 */
function fillFirstMemberCopy(
  tracks: Map<string, RegisteredMockObject>,
): RegisteredMockObject {
  const slot = registerClipSlot(3, 0, true);

  registerClipSlot(3, 0, true, { is_arrangement_clip: 0 });
  tracks.set(
    "copy-1-m1",
    registerMockObject("copy-1-m1", {
      path: livePath.track(3),
      properties: {
        group_track: ["id", "copy-1"],
        devices: children("d0", "d1"),
        clip_slots: children("live_set/tracks/3/clip_slots/0"),
        arrangement_clips: children("arr0"),
      },
    }),
  );
  registerMockObject("arr0", { properties: { is_arrangement_clip: 1 } });

  return slot;
}

describe("duplicate - group track", () => {
  it("copies the group itself every time, never a member", async () => {
    const { liveSet, tracks } = groupWithOneMember();

    const result = await duplicate({
      type: "track",
      id: "group",
      count: 2,
      name: "A,B",
      withoutClips: true,
    });

    // Live puts each copy after the group's members, ahead of earlier copies.
    expect(result).toStrictEqual([
      {
        id: "copy-2",
        path: "t2",
        clips: [],
        detail:
          "also copied the track inside this group track: t3 (id copy-2-m1)",
      },
      {
        id: "copy-1",
        path: "t4",
        clips: [],
        detail:
          "also copied the track inside this group track: t5 (id copy-1-m1)",
      },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(2);
    expect(liveSet.call).toHaveBeenNthCalledWith(1, "duplicate_track", 0);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "duplicate_track", 0);
    expect(tracks.get("copy-2")?.set).toHaveBeenCalledWith("name", "A");
    expect(tracks.get("copy-1")?.set).toHaveBeenCalledWith("name", "B");
    expect(tracks.get("member")?.set).not.toHaveBeenCalled();
    expect(tracks.get("member")?.get).not.toHaveBeenCalledWith("clip_slots");
  });

  it("refuses when Live makes no new track", async () => {
    const { liveSet } = groupWithOneMember();

    liveSet.methods.duplicate_track = () => null;

    await expect(duplicate({ type: "track", id: "group" })).rejects.toThrow(
      "Live made no copy of t0",
    );
  });

  it("strips the members' copies too", async () => {
    const { tracks } = groupWithOneMember();
    const slot = fillFirstMemberCopy(tracks);

    const result = await duplicate({
      type: "track",
      id: "group",
      withoutClips: true,
      withoutDevices: true,
    });

    expect(result).toStrictEqual({
      id: "copy-1",
      path: "t2",
      clips: [],
      detail:
        "also copied the track inside this group track: t3 (id copy-1-m1)",
    });
    const memberCopy = tracks.get("copy-1-m1") as RegisteredMockObject;

    expectDeleteDeviceCalls(memberCopy, 2);
    expect(slot.call).toHaveBeenCalledWith("delete_clip");
    expect(memberCopy.call).toHaveBeenCalledWith("delete_clip", "id arr0");
  });

  it("lists the members' clips where they end up", async () => {
    const { tracks } = groupWithOneMember();

    fillFirstMemberCopy(tracks);
    tracks.get("copy-1-m1")!.properties.arrangement_clips = [];

    const result = await duplicate({ type: "track", id: "group", count: 2 });

    // The first copy's member was read at t3, then pushed to t5 by the second.
    expect(result).toStrictEqual([
      {
        id: "copy-2",
        path: "t2",
        clips: [],
        detail:
          "also copied the track inside this group track: t3 (id copy-2-m1)",
      },
      {
        id: "copy-1",
        path: "t4",
        clips: [{ id: "live_set/tracks/3/clip_slots/0/clip", path: "t5/s0" }],
        detail:
          "also copied the track inside this group track: t5 (id copy-1-m1)",
      },
    ]);
  });

  it("removes the Producer Pal device from its host member's copy", async () => {
    const { tracks } = groupWithOneMember();

    registerMockObject("this_device", { path: livePath.track(1).device(0) });

    const result = await duplicate({ type: "track", id: "group" });

    expect(result).toStrictEqual({
      id: "copy-1",
      path: "t2",
      clips: [],
      detail:
        "the Producer Pal device was not copied; also copied the track inside this group track: t3 (id copy-1-m1)",
    });
    expect(tracks.get("copy-1-m1")?.call).toHaveBeenCalledWith(
      "delete_device",
      0,
    );
    expect(tracks.get("copy-1")?.call).not.toHaveBeenCalledWith(
      "delete_device",
      expect.anything(),
    );
  });

  it("leaves the copies' devices alone when the host is outside the group", async () => {
    const { tracks } = groupWithOneMember();

    registerMockObject("this_device", { path: livePath.track(2).device(0) });

    const result = await duplicate({ type: "track", id: "group" });

    expect(result).toStrictEqual({
      id: "copy-1",
      path: "t2",
      clips: [],
      detail:
        "also copied the track inside this group track: t3 (id copy-1-m1)",
    });

    for (const id of ["copy-1", "copy-1-m1"]) {
      expect(tracks.get(id)?.call).not.toHaveBeenCalledWith(
        "delete_device",
        expect.anything(),
      );
    }
  });
});
