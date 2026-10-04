// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MAX_TAKE_LANES } from "#src/tools/constants.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

/**
 * The lane mock at an index on track 0.
 * @param laneIndex - 0-based lane index
 * @returns The registered mock, or undefined when no lane is there
 */
function lane(laneIndex: number): RegisteredMockObject | undefined {
  return lookupMockObject(undefined, livePath.track(0).takeLane(laneIndex));
}

describe("updateTrack take lane targets", () => {
  let track: RegisteredMockObject;

  beforeEach(() => {
    track = registerTakeLaneTrack({ initialLanes: 0 });
  });

  it("appends a lane for an l+ path", () => {
    const result = updateTrack({ path: "t0/l+", name: "Take A" });

    expect(track.call).toHaveBeenCalledExactlyOnceWith("create_take_lane");
    expect(lane(0)?.set).toHaveBeenCalledWith("name", "Take A");
    expect(result).toStrictEqual({
      id: lane(0)!.id,
      path: "t0/l0",
      created: "l0",
    });
  });

  // Nothing else shows the name Live gave a lane this call made.
  it("appends a lane with no name, reporting the name Live gave it", () => {
    const result = updateTrack({ path: "t0/l+" });

    expect(track.call).toHaveBeenCalledExactlyOnceWith("create_take_lane");
    expect(lane(0)?.set).not.toHaveBeenCalledWith("name", expect.anything());
    expect(result).toStrictEqual({
      id: lane(0)!.id,
      path: "t0/l0",
      name: "Lane",
      created: "l0",
    });
  });

  it("appends one lane per l+ entry, each with its own name", () => {
    const result = updateTrack({
      path: "t0/l+,t0/l+",
      name: "Take A,Take B",
    });

    expect(track.call).toHaveBeenCalledTimes(2);
    expect(lane(0)?.set).toHaveBeenCalledWith("name", "Take A");
    expect(lane(1)?.set).toHaveBeenCalledWith("name", "Take B");
    expect(result).toStrictEqual([
      { id: lane(0)!.id, path: "t0/l0", created: "l0" },
      { id: lane(1)!.id, path: "t0/l1", created: "l1" },
    ]);
  });

  it("creates the lanes up to the index a path names", () => {
    const result = updateTrack({ path: "t0/l2", name: "Third" });

    expect(track.call).toHaveBeenCalledTimes(3);
    // Only the lane the path named is renamed; the ones filling the gap keep
    // whatever Live called them.
    expect(lane(0)?.set).not.toHaveBeenCalledWith("name", expect.anything());
    expect(lane(2)?.set).toHaveBeenCalledWith("name", "Third");
    expect(result).toStrictEqual({
      id: lane(2)!.id,
      path: "t0/l2",
      created: "l0-l2",
    });
  });

  it("renames a lane that already exists, without creating one", () => {
    registerTakeLaneTrack({ initialLanes: 2 });

    const result = updateTrack({ path: "t0/l1", name: "Renamed" });

    expect(lane(1)?.set).toHaveBeenCalledWith("name", "Renamed");
    expect(result).toStrictEqual({
      id: lane(1)!.id,
      path: "t0/l1",
    });
  });

  it("keeps the rename when reading the name back throws", () => {
    registerTakeLaneTrack({ initialLanes: 1 });

    const original = lane(0)!.get.getMockImplementation()!;

    lane(0)!.get.mockImplementation((property: string) => {
      if (property === "name") {
        throw new Error("Live went away");
      }

      return original(property);
    });

    const result = updateTrack({ path: "t0/l0", name: "Renamed" });

    expect(lane(0)?.set).toHaveBeenCalledWith("name", "Renamed");
    expect(result).toStrictEqual({
      id: lane(0)!.id,
      path: "t0/l0",
      detail: expect.stringContaining("already changed: name"),
    });
  });

  it("reports the name Live kept when it isn't the one sent", () => {
    registerTakeLaneTrack({ initialLanes: 1 });
    // Live ignores the write, so the lane keeps its old name.
    lane(0)!.set.mockImplementation(() => {});

    const result = updateTrack({ path: "t0/l0", name: "Renamed" });

    expect(result).toStrictEqual({
      id: lane(0)!.id,
      path: "t0/l0",
      name: "Lane",
    });
  });

  it("refuses a lane that exists and nothing to do to it", () => {
    registerTakeLaneTrack({ initialLanes: 1 });

    expect(() => updateTrack({ path: "t0/l0" })).toThrow("nothing to update");
  });

  it("mixes tracks and lanes in one list, pairing the names in order", () => {
    registerMockObject("t1", {
      path: livePath.track(1),
      properties: { is_foldable: 0 },
    });

    const result = updateTrack({
      path: "t1,t0/l0,t0/l+",
      name: "Track,First,Second",
    });

    expect(result).toStrictEqual([
      { id: "t1", path: "t1" },
      { id: lane(0)!.id, path: "t0/l0", created: "l0" },
      { id: lane(1)!.id, path: "t0/l1", created: "l1" },
    ]);
  });

  it("says which params a lane had no use for, and still names it", () => {
    const result = updateTrack({
      path: "t0/l+",
      name: "Take A",
      color: "#FF0000",
      mute: true,
    });

    expect(lane(0)?.set).not.toHaveBeenCalledWith("color", expect.anything());
    expect(result).toStrictEqual({
      id: lane(0)!.id,
      path: "t0/l0",
      created: "l0",
      detail: "color, mute ignored: a take lane takes only name",
    });
  });

  it("skips a lane the call could do nothing to, and the mention before it", () => {
    registerTakeLaneTrack({ initialLanes: 1 });

    const result = updateTrack({ path: "t0/l0,t0/l0", color: "#FF0000" });

    expect(result).toStrictEqual([
      {
        path: "t0/l0",
        ok: false,
        detail: 'not written: "t0/l0" was meant to replace it, but failed',
      },
      {
        path: "t0/l0",
        ok: false,
        detail: "color ignored: a take lane takes only name",
      },
    ]);
  });

  it("throws for a lone lane the call could do nothing to", () => {
    registerTakeLaneTrack({ initialLanes: 1 });

    expect(() => updateTrack({ path: "t0/l0", gainDb: -3 })).toThrow(
      "gainDb ignored: a take lane takes only name",
    );
    expect(() => updateTrack({ id: lane(0)!.id, color: "#FF0000" })).toThrow(
      "color ignored: a take lane takes only name",
    );
  });

  it("names a lane by the id it reported, with the same entry back", () => {
    registerTakeLaneTrack({ initialLanes: 2 });

    const byPath = updateTrack({ path: "t0/l1", name: "Renamed" });
    const byId = updateTrack({ id: lane(1)!.id, name: "Renamed" });

    expect(byId).toStrictEqual(byPath);
    expect(byId).toStrictEqual({
      id: lane(1)!.id,
      path: "t0/l1",
    });
  });

  it("takes a lane id beside track ids and lane paths, in one list", () => {
    registerTakeLaneTrack({ initialLanes: 1 });
    registerMockObject("t1", {
      path: livePath.track(1),
      properties: { is_foldable: 0 },
    });

    const existing = lane(0)!.id;
    const result = updateTrack({
      id: `${existing},t1`,
      path: "t0/l+",
      name: "First,Track,Third",
    });

    expect(result).toStrictEqual([
      { id: existing, path: "t0/l0" },
      { id: "t1", path: "t1" },
      { id: lane(1)!.id, path: "t0/l1", created: "l1" },
    ]);
  });

  it("skips a lane named by id that the call could do nothing to", () => {
    registerTakeLaneTrack({ initialLanes: 1 });

    const id = lane(0)!.id;
    const result = updateTrack({ id: `${id},${id}`, color: "#FF0000" });

    expect(lane(0)?.set).not.toHaveBeenCalledWith("color", expect.anything());
    expect(result).toStrictEqual([
      {
        id,
        ok: false,
        detail: `not written: id ${id} was meant to replace it, but failed`,
      },
      { id, ok: false, detail: "color ignored: a take lane takes only name" },
    ]);
  });

  it("counts a lane named by id against the cap without adding to it", () => {
    registerTakeLaneTrack({ initialLanes: MAX_TAKE_LANES });

    const result = updateTrack({
      id: lane(MAX_TAKE_LANES - 1)!.id,
      name: "Last",
    });

    expect(result).toStrictEqual({
      id: lane(MAX_TAKE_LANES - 1)!.id,
      path: `t0/l${MAX_TAKE_LANES - 1}`,
    });
  });

  // Live lets the user make more lanes than the cap; renaming one creates none.
  it("renames a lane past the cap on a track that already has it", () => {
    track = registerTakeLaneTrack({ initialLanes: MAX_TAKE_LANES + 2 });

    const result = updateTrack({
      path: `t0/l${MAX_TAKE_LANES + 1},t0/l2`,
      name: "Keep,Also",
    });

    expect(result).toStrictEqual([
      expect.objectContaining({
        path: `t0/l${MAX_TAKE_LANES + 1}`,
      }),
      expect.objectContaining({ path: "t0/l2" }),
    ]);
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  it("refuses the whole call when the lanes would pass the cap", () => {
    registerTakeLaneTrack({ initialLanes: MAX_TAKE_LANES - 1 });

    expect(() => updateTrack({ path: "t0/l+,t0/l+" })).toThrow(
      `take lane "l${MAX_TAKE_LANES}" is out of range: Producer Pal creates ` +
        `take lanes only up to "l${MAX_TAKE_LANES - 1}"; "t0/l+" would add it. ` +
        `Nothing was created`,
    );
    // Nothing was created: a lane an earlier entry made could not be taken back.
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  // Lanes past the cap can exist, so the message mustn't say otherwise.
  it("refuses adding a lane to a track already past the cap", () => {
    registerTakeLaneTrack({ initialLanes: MAX_TAKE_LANES + 2 });

    expect(() => updateTrack({ path: "t0/l+" })).toThrow(
      `take lane "l${MAX_TAKE_LANES + 2}" is out of range: Producer Pal ` +
        `creates take lanes only up to "l${MAX_TAKE_LANES - 1}"; "t0/l+" would add it.`,
    );
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  it("refuses an index past the cap before creating the lanes up to it", () => {
    expect(() => updateTrack({ path: `t0/l${MAX_TAKE_LANES}` })).toThrow(
      `take lane "l${MAX_TAKE_LANES}" is out of range`,
    );
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  it("counts each track's lanes on its own", () => {
    registerTakeLaneTrack({ trackIndex: 1, initialLanes: MAX_TAKE_LANES - 1 });

    const result = updateTrack({ path: "t0/l+,t1/l+" }) as Array<{
      path?: string;
    }>;

    expect(result.map((entry) => entry.path)).toStrictEqual([
      "t0/l0",
      `t1/l${MAX_TAKE_LANES - 1}`,
    ]);
  });

  it("skips a lane path on a track that has none, and keeps the slot", () => {
    mockNonExistentObjects();
    registerMockObject("group", {
      path: livePath.track(1),
      properties: { is_foldable: 1 },
    });

    const result = updateTrack({
      path: "t1/l0,t9/l0,t0/l+",
      name: "A,B,C",
    });

    expect(result).toStrictEqual([
      {
        path: "t1/l0",
        ok: false,
        detail: 'only regular tracks have take lanes; "t1" is a group track',
      },
      {
        path: "t9/l0",
        ok: false,
        detail: 'no track at path "t9/l0"; ppal-create-track adds tracks',
      },
      { id: lane(0)!.id, path: "t0/l0", created: "l0" },
    ]);
  });

  it.each(["rt0/l0", "mt/l0"])(
    "refuses the whole call for %s, which can't be parsed as a lane",
    (path) => {
      expect(() => updateTrack({ path: `t0/l+,${path}`, name: "A,B" })).toThrow(
        `invalid path "${path}" - a take lane is "t<track>/l<lane>"`,
      );
      expect(track.call).not.toHaveBeenCalled();
    },
  );

  // Appending a lane is something asked, so the refusal that comes back is the
  // track's own, not "nothing to update".
  it("says why an appended lane can't be had, rather than that nothing was asked", () => {
    mockNonExistentObjects();
    registerMockObject("group", {
      path: livePath.track(1),
      properties: { is_foldable: 1 },
    });

    expect(() => updateTrack({ path: "t9/l+" })).toThrow(
      'no track at path "t9/l+"; ppal-create-track adds tracks',
    );
    expect(() => updateTrack({ path: "t1/l+" })).toThrow(
      'only regular tracks have take lanes; "t1" is a group track',
    );
    expect(updateTrack({ path: "t9/l+,t1/l+" })).toStrictEqual([
      {
        path: "t9/l+",
        ok: false,
        detail: 'no track at path "t9/l+"; ppal-create-track adds tracks',
      },
      {
        path: "t1/l+",
        ok: false,
        detail: 'only regular tracks have take lanes; "t1" is a group track',
      },
    ]);
  });

  it("throws for a lone lane target it can't reach", () => {
    mockNonExistentObjects();

    expect(() => updateTrack({ path: "t9/l0", name: "Nope" })).toThrow(
      'no track at path "t9/l0"; ppal-create-track adds tracks',
    );
  });
});

describe("updateTrack with no take lane targets", () => {
  it("leaves a track path alone", () => {
    registerMockObject("t0", {
      path: livePath.track(0),
      properties: { is_foldable: 0, take_lanes: children() },
    });

    expect(updateTrack({ path: "t0", name: "Plain" })).toStrictEqual({
      id: "t0",
      path: "t0",
    });
  });
});
