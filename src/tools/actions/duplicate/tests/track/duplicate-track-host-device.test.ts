// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A copy of the host track gets only the Producer Pal device taken off it,
// wherever in the track that device sits.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerMockObject,
  registerTrackCopySet,
  type RegisteredMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

const NOT_COPIED = "the Producer Pal device was not copied";

/**
 * Put the Producer Pal device at a path and register what the copy has along
 * the way to it, so each can be asked what it was told to delete.
 * @param host - The host device's path on the source track
 * @param copyTrack - The copy of that track
 * @param along - The paths on the copy that lead to the device's own parent
 * @returns Each of those, by path
 */
function hostAt(
  host: string,
  copyTrack: ReturnType<typeof livePath.track>,
  along: string[],
): Map<string, RegisteredMockObject> {
  registerMockObject("this_device", { path: host });

  return new Map(
    along.map((path, index) => [
      path.replace(String(copyTrack), "").trim(),
      registerMockObject(`copy-${String(copyTrack)}-${index}`, { path }),
    ]),
  );
}

/**
 * Assert that only one object on the copy was told to delete a device.
 * @param all - Every object that could have been
 * @param only - The one that should have been
 * @param index - The device index it should have been told to delete
 */
function expectOnlyDeleted(
  all: RegisteredMockObject[],
  only: RegisteredMockObject,
  index: number,
): void {
  for (const object of all) {
    if (object === only) {
      expect(object.call).toHaveBeenCalledWith("delete_device", index);
      expect(object.call).toHaveBeenCalledTimes(1);
    } else {
      expect(object.call).not.toHaveBeenCalledWith(
        "delete_device",
        expect.anything(),
      );
    }
  }
}

describe("duplicate - the Producer Pal device on a track copy", () => {
  it("removes a device on the track itself, and nothing else", async () => {
    const { tracks } = registerTrackCopySet(["track1"]);

    registerMockObject("this_device", { path: livePath.track(0).device(2) });

    expect(await duplicate({ type: "track", id: "track1" })).toStrictEqual({
      id: "copy-1",
      path: "t1",
      clips: [],
      detail: NOT_COPIED,
    });
    expectOnlyDeleted([...tracks.values()], tracks.get("copy-1")!, 2);
  });

  it("removes a device inside a rack's chain, and leaves the rack", async () => {
    const { tracks } = registerTrackCopySet(["track1"]);
    const copy = livePath.track(1);
    const along = hostAt(
      String(livePath.track(0).device(0).chain(0).device(1)),
      copy,
      [String(copy.device(0)), String(copy.device(0).chain(0))],
    );
    const rack = along.get("devices 0")!;
    const chain = along.get("devices 0 chains 0")!;

    expect(await duplicate({ type: "track", id: "track1" })).toStrictEqual({
      id: "copy-1",
      path: "t1",
      clips: [],
      detail: NOT_COPIED,
    });
    expectOnlyDeleted([tracks.get("copy-1")!, rack, chain], chain, 1);
  });

  it("removes a device inside a nested rack, and leaves both racks", async () => {
    const { tracks } = registerTrackCopySet(["track1"]);
    const copy = livePath.track(1);
    const outer = copy.device(0).chain(1);
    const inner = outer.device(2).chain(0);
    const along = hostAt(
      String(livePath.track(0).device(0).chain(1).device(2).chain(0).device(3)),
      copy,
      [
        String(copy.device(0)),
        String(outer),
        String(outer.device(2)),
        String(inner),
      ],
    );
    const objects = [...along.values()];
    const innerChain = along.get("devices 0 chains 1 devices 2 chains 0")!;

    await duplicate({ type: "track", id: "track1" });

    expectOnlyDeleted([tracks.get("copy-1")!, ...objects], innerChain, 3);
  });

  it("removes it from the copy of a group member that holds it", async () => {
    const { tracks } = registerTrackCopySet(["group", "member", "other"], {
      index: 0,
      members: 1,
    });
    const memberCopy = livePath.track(3);
    const along = hostAt(
      String(livePath.track(1).device(0).chain(0).device(0)),
      memberCopy,
      [String(memberCopy.device(0)), String(memberCopy.device(0).chain(0))],
    );
    const chain = along.get("devices 0 chains 0")!;

    expect(await duplicate({ type: "track", id: "group" })).toStrictEqual({
      id: "copy-1",
      path: "t2",
      clips: [],
      detail: `${NOT_COPIED}; also copied the track inside this group track: t3 (id copy-1-m1)`,
    });
    expectOnlyDeleted(
      [
        tracks.get("copy-1")!,
        tracks.get("copy-1-m1")!,
        along.get("devices 0")!,
        chain,
      ],
      chain,
      0,
    );
  });

  it("says so when the host's path doesn't lead to a device", async () => {
    const { tracks } = registerTrackCopySet(["track1"]);

    registerMockObject("this_device", {
      path: `${livePath.track(0)} mixer_device`,
    });

    expect(await duplicate({ type: "track", id: "track1" })).toStrictEqual({
      id: "copy-1",
      path: "t1",
      clips: [],
      detail: "could not check the new track for the Producer Pal device",
    });
    expect(tracks.get("copy-1")?.call).not.toHaveBeenCalledWith(
      "delete_device",
      expect.anything(),
    );
  });
});
