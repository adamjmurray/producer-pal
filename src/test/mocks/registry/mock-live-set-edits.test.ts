// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LiveAPI, children } from "../mock-live-api.ts";
import {
  deleteMockObject,
  lookupMockObject,
  registerMockObject,
  registerPendingMockObject,
  simulateMockDeletes,
  simulateMockMoves,
} from "../mock-registry.ts";

/**
 * Register a Live Set listing tracks 0..n-1, each with devices of its own.
 * @param count - How many tracks
 * @returns The Live Set mock
 */
function setUpTracks(count: number): ReturnType<typeof registerMockObject> {
  const ids = Array.from({ length: count }, (_, i) => `t${i}`);

  for (const [i, id] of ids.entries()) {
    registerMockObject(id, { path: livePath.track(i) });
    registerMockObject(`${id}-d0`, { path: livePath.track(i).device(0) });
  }

  return registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children(...ids) },
  });
}

describe("inserting", () => {
  it("shifts later tracks, and what is under them, one place along", () => {
    const liveSet = setUpTracks(3);
    const held = LiveAPI.from("id t2");

    const result = LiveAPI.from(livePath.liveSet).call("create_midi_track", 1);

    expect(result).toStrictEqual(["id", "90001"]);
    expect(held.path).toBe("live_set tracks 3");
    expect(lookupMockObject("t2-d0")?.path).toBe("live_set tracks 3 devices 0");
    expect(lookupMockObject("t0")?.path).toBe("live_set tracks 0");
    expect(lookupMockObject("90001")?.path).toBe("live_set tracks 1");
    expect(liveSet.properties.tracks).toStrictEqual(
      children("t0", "90001", "t1", "t2"),
    );
  });

  it("gives every created object an id of its own", () => {
    setUpTracks(1);

    const liveSet = LiveAPI.from(livePath.liveSet);
    const ids = [
      liveSet.call("create_audio_track", -1),
      liveSet.call("create_return_track"),
      liveSet.call("create_scene", -1),
    ].map((result) => (result as string[])[1]);

    expect(new Set(ids).size).toBe(3);
  });

  it("appends at the end for -1, after the tracks the Set lists", () => {
    const liveSet = setUpTracks(2);

    LiveAPI.from(livePath.liveSet).call("create_midi_track", -1);

    expect(lookupMockObject("90001")?.path).toBe("live_set tracks 2");
    expect(liveSet.properties.tracks).toStrictEqual(
      children("t0", "t1", "90001"),
    );
  });

  it("pads a child list shorter than the index", () => {
    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("a") },
    });

    LiveAPI.from(livePath.liveSet).call("duplicate_track", 3);

    expect(liveSet.properties.tracks).toStrictEqual(
      children("a", "mock-tracks-1", "mock-tracks-2", "mock-tracks-3", "90001"),
    );
  });

  it("inserts a duplicated track right after its source", () => {
    setUpTracks(2);

    LiveAPI.from(livePath.liveSet).call("duplicate_track", 0);

    expect(lookupMockObject("t1")?.path).toBe("live_set tracks 2");
    expect(lookupMockObject("90001")?.path).toBe("live_set tracks 1");
  });

  it("shifts devices on one track and no other", () => {
    setUpTracks(2);

    const track = LiveAPI.from(livePath.track(0));
    const result = track.call("insert_device", "Reverb", 0);

    expect(result).toStrictEqual(["id", "90001"]);
    expect(lookupMockObject("t0-d0")?.path).toBe("live_set tracks 0 devices 1");
    expect(lookupMockObject("t1-d0")?.path).toBe("live_set tracks 1 devices 0");
  });

  it("inserts chains into a rack", () => {
    registerMockObject("rack", {
      path: livePath.track(0).device(0),
      properties: { chains: children("c0") },
    });

    const result = LiveAPI.from(livePath.track(0).device(0)).call(
      "insert_chain",
    );

    expect(result).toStrictEqual(["id", "90001"]);
    expect(lookupMockObject("90001")?.path).toBe(
      "live_set tracks 0 devices 0 chains 1",
    );
  });

  it("gives each track a slot when a scene is made, and moves the slots after it", () => {
    const track = registerMockObject("t0", {
      path: livePath.track(0),
      properties: { clip_slots: children("s0", "s1") },
    });

    registerMockObject("s0", { path: livePath.track(0).clipSlot(0) });
    registerMockObject("s1", { path: livePath.track(0).clipSlot(1) });
    registerMockObject("scene0", { path: livePath.scene(0) });
    registerMockObject("scene1", { path: livePath.scene(1) });

    LiveAPI.from(livePath.liveSet).call("create_scene", 1);

    expect(lookupMockObject("scene1")?.path).toBe("live_set scenes 2");
    expect(lookupMockObject("s1")?.path).toBe("live_set tracks 0 clip_slots 2");
    expect(
      lookupMockObject(undefined, "live_set tracks 0 clip_slots 1")?.id,
    ).toBe("90002");
    expect(track.properties.clip_slots).toStrictEqual(
      children("s0", "90002", "s1"),
    );
  });

  it("copies a scene to the index after it", () => {
    registerMockObject("scene0", { path: livePath.scene(0) });
    registerMockObject("scene1", { path: livePath.scene(1) });

    LiveAPI.from(livePath.liveSet).call("duplicate_scene", 0);

    expect(lookupMockObject("scene1")?.path).toBe("live_set scenes 2");
    expect(lookupMockObject("90001")?.path).toBe("live_set scenes 1");
  });

  it("counts a clip slot as a scene when it sizes the Set", () => {
    registerMockObject("s4", { path: livePath.track(0).clipSlot(4) });

    LiveAPI.from(livePath.liveSet).call("create_scene", -1);

    expect(lookupMockObject("90001")?.path).toBe("live_set scenes 5");
  });
});

describe("creating clips", () => {
  it("fills an empty slot without moving anything", () => {
    registerMockObject("slot", { path: livePath.track(0).clipSlot(0) });

    LiveAPI.from(livePath.track(0).clipSlot(0)).call("create_clip", 4);

    expect(
      lookupMockObject(undefined, "live_set tracks 0 clip_slots 0 clip")?.id,
    ).toBe("90001");
  });

  it("keeps a clip a test registered in the slot as the one made", () => {
    const clip = registerMockObject("mine", {
      path: livePath.track(0).clipSlot(0).clip(),
    });

    LiveAPI.from(livePath.track(0).clipSlot(0)).call("create_audio_clip", "x");

    expect(
      lookupMockObject(undefined, "live_set tracks 0 clip_slots 0 clip"),
    ).toBe(clip);
  });

  it("puts a duplicated clip in the destination slot", () => {
    registerMockObject("dest", { path: livePath.track(1).clipSlot(0) });

    LiveAPI.from(livePath.track(0).clipSlot(0)).call(
      "duplicate_clip_to",
      "id dest",
    );

    expect(
      lookupMockObject(undefined, "live_set tracks 1 clip_slots 0 clip"),
    ).toBeDefined();
  });

  it("does nothing for a destination that isn't there", () => {
    LiveAPI.from(livePath.track(0).clipSlot(0)).call(
      "duplicate_clip_to",
      "id nowhere",
    );

    expect(
      lookupMockObject(undefined, "live_set tracks 1 clip_slots 0 clip"),
    ).toBeUndefined();
  });

  it("orders arrangement clips by start time", () => {
    const track = registerMockObject("t0", {
      path: livePath.track(0),
      properties: { arrangement_clips: children("a", "b") },
    });

    registerMockObject("a", {
      path: livePath.track(0).arrangementClip(0),
      properties: { start_time: 0 },
    });
    registerMockObject("b", {
      path: livePath.track(0).arrangementClip(1),
      properties: { start_time: 8 },
    });

    const result = LiveAPI.from(livePath.track(0)).call(
      "create_midi_clip",
      4,
      4,
    );

    expect(result).toStrictEqual(["id", "90001"]);
    expect(lookupMockObject("b")?.path).toBe(
      "live_set tracks 0 arrangement_clips 2",
    );
    expect(lookupMockObject("90001")?.path).toBe(
      "live_set tracks 0 arrangement_clips 1",
    );
    expect(track.properties.arrangement_clips).toStrictEqual(
      children("a", "90001", "b"),
    );
  });

  it("goes last when a sibling has no start time", () => {
    registerMockObject("a", { path: livePath.track(0).arrangementClip(0) });

    LiveAPI.from(livePath.track(0)).call("create_audio_clip", "x", 0);
    LiveAPI.from(livePath.track(0)).call(
      "duplicate_clip_to_arrangement",
      "id a",
      0,
    );

    expect(lookupMockObject("90001")?.path).toBe(
      "live_set tracks 0 arrangement_clips 1",
    );
    expect(lookupMockObject("90002")?.path).toBe(
      "live_set tracks 0 arrangement_clips 2",
    );
  });
});

describe("deleting", () => {
  it("closes the gap: later tracks shift down, the list drops the id", () => {
    const liveSet = setUpTracks(3);
    const held = LiveAPI.from("id t2");

    simulateMockDeletes();
    LiveAPI.from(livePath.liveSet).call("delete_track", 0);

    expect(held.path).toBe("live_set tracks 1");
    expect(lookupMockObject("t1-d0")?.path).toBe("live_set tracks 0 devices 0");
    expect(liveSet.properties.tracks).toStrictEqual(children("t1", "t2"));
  });

  it("takes what is under a deleted object with it", () => {
    setUpTracks(2);
    simulateMockDeletes();

    const device = LiveAPI.from("id t0-d0");

    LiveAPI.from(livePath.liveSet).call("delete_track", 0);

    expect(device.path).toBe("");
    expect(lookupMockObject("t0-d0")).toBeUndefined();
  });

  it("shifts devices after a deleted one", () => {
    registerMockObject("d0", { path: livePath.track(0).device(0) });
    registerMockObject("d1", { path: livePath.track(0).device(1) });
    simulateMockDeletes();

    LiveAPI.from(livePath.track(0)).call("delete_device", 0);

    expect(lookupMockObject("d1")?.path).toBe("live_set tracks 0 devices 0");
  });

  it("shifts a scene's clip slots on every track, and drops the deleted one", () => {
    const track = registerMockObject("t0", {
      path: livePath.track(0),
      properties: { clip_slots: children("s0", "s1", "s2") },
    });

    for (const [i, id] of ["s0", "s1", "s2"].entries()) {
      registerMockObject(id, { path: livePath.track(0).clipSlot(i) });
    }

    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(1).clip(),
    });
    registerMockObject("scene1", { path: livePath.scene(1) });
    registerMockObject("scene2", { path: livePath.scene(2) });
    simulateMockDeletes();

    LiveAPI.from(livePath.liveSet).call("delete_scene", 1);

    expect(lookupMockObject("s2")?.path).toBe("live_set tracks 0 clip_slots 1");
    expect(lookupMockObject("scene2")?.path).toBe("live_set scenes 1");
    expect(lookupMockObject("s1")).toBeUndefined();
    expect(lookupMockObject("clip1")).toBeUndefined();
    expect(track.properties.clip_slots).toStrictEqual(children("s0", "s2"));
  });

  it("shifts later arrangement clips when a clip is deleted by id", () => {
    registerMockObject("a", { path: livePath.track(0).arrangementClip(0) });
    registerMockObject("b", { path: livePath.track(0).arrangementClip(1) });

    deleteMockObject("a");

    expect(lookupMockObject("b")?.path).toBe(
      "live_set tracks 0 arrangement_clips 0",
    );
  });

  it("leaves paths alone for an object that isn't in a list", () => {
    registerMockObject("clip", { path: livePath.track(0).clipSlot(0).clip() });
    registerMockObject("t1", { path: livePath.track(1) });

    deleteMockObject("clip");

    expect(lookupMockObject("t1")?.path).toBe("live_set tracks 1");
  });
});

describe("a pending object", () => {
  it("appears where a creating call lands, with what is under it", () => {
    const track = registerPendingMockObject("copy", {
      path: livePath.track(1),
    });

    registerPendingMockObject("copy-d0", { path: livePath.track(1).device(0) });
    registerMockObject("t1", { path: livePath.track(1) });

    expect(lookupMockObject("copy")).toBeUndefined();

    LiveAPI.from(livePath.liveSet).call("duplicate_track", 0);

    expect(lookupMockObject("copy")).toBe(track);
    expect(lookupMockObject("copy-d0")?.path).toBe(
      "live_set tracks 1 devices 0",
    );
    expect(lookupMockObject("t1")?.path).toBe("live_set tracks 2");
  });

  it("is made again for the next creation once the first copy is gone", () => {
    const track = registerPendingMockObject("copy", {
      path: livePath.track(1),
    });

    registerMockObject("t0", { path: livePath.track(0) });
    simulateMockDeletes();
    LiveAPI.from(livePath.liveSet).call("duplicate_track", 0);
    LiveAPI.from(livePath.liveSet).call("delete_track", 1);

    expect(lookupMockObject("copy")).toBeUndefined();

    LiveAPI.from(livePath.liveSet).call("duplicate_track", 0);

    expect(lookupMockObject("copy")).toBe(track);
    expect(track.path).toBe("live_set tracks 1");
  });

  it("never arrives once it is deleted first", () => {
    registerPendingMockObject("copy", { path: livePath.track(1) });

    deleteMockObject("copy");
    LiveAPI.from(livePath.liveSet).call("duplicate_track", 0);

    expect(lookupMockObject("copy")).toBeUndefined();
    expect(LiveAPI.from(livePath.track(1)).path).not.toBe("");
  });
});

describe("moving a device", () => {
  /**
   * Two tracks, the first holding three devices and the second two.
   * @param moves - Whether `move_device` moves what it names
   * @returns The tracks' mocks
   */
  function setUpDevices(moves = true): ReturnType<typeof registerMockObject>[] {
    const tracks = [0, 1].map((t) =>
      registerMockObject(`t${t}`, {
        path: livePath.track(t),
        properties: {
          devices: children(
            ...Array.from({ length: t === 0 ? 3 : 2 }, (_, d) => `t${t}d${d}`),
          ),
        },
      }),
    );

    for (const [t, count] of [
      [0, 3],
      [1, 2],
    ] as const) {
      for (let d = 0; d < count; d++) {
        registerMockObject(`t${t}d${d}`, {
          path: livePath.track(t).device(d),
        });
      }
    }

    registerMockObject("live_set", { path: livePath.liveSet });

    if (moves) {
      simulateMockMoves();
    }

    return tracks;
  }

  it("closes up where it was and makes room where it lands", () => {
    const [from, to] = setUpDevices();

    LiveAPI.from(livePath.liveSet).call("move_device", "id t0d1", "id t1", 1);

    expect(lookupMockObject("t0d1")?.path).toBe("live_set tracks 1 devices 1");
    expect(lookupMockObject("t0d2")?.path).toBe("live_set tracks 0 devices 1");
    expect(lookupMockObject("t1d1")?.path).toBe("live_set tracks 1 devices 2");
    expect(lookupMockObject("t1d0")?.path).toBe("live_set tracks 1 devices 0");
    expect(from?.properties.devices).toStrictEqual(children("t0d0", "t0d2"));
    expect(to?.properties.devices).toStrictEqual(
      children("t1d0", "t0d1", "t1d1"),
    );
  });

  it("appends when it is given no index, and carries what is under it", () => {
    setUpDevices();
    registerMockObject("t0d0-chain", {
      path: `${String(livePath.track(0).device(0))} chains 0`,
    });

    LiveAPI.from(livePath.liveSet).call("move_device", "id t0d0", "id t1");

    expect(lookupMockObject("t0d0")?.path).toBe("live_set tracks 1 devices 2");
    expect(lookupMockObject("t0d0-chain")?.path).toBe(
      "live_set tracks 1 devices 2 chains 0",
    );
  });

  it("gives a container that listed no devices a list", () => {
    setUpDevices();
    registerMockObject("t2", { path: livePath.track(2) });

    LiveAPI.from(livePath.liveSet).call("move_device", "id t0d0", "id t2", 0);

    expect(lookupMockObject("t2")?.properties.devices).toStrictEqual(
      children("t0d0"),
    );
  });

  it("leaves the device where it is unless moves are simulated", () => {
    setUpDevices(false);

    LiveAPI.from(livePath.liveSet).call("move_device", "id t0d1", "id t1", 1);

    expect(lookupMockObject("t0d1")?.path).toBe("live_set tracks 0 devices 1");
  });

  it("does nothing for a device or a container it doesn't know", () => {
    setUpDevices();

    LiveAPI.from(livePath.liveSet).call("move_device", "id nobody", "id t1", 0);
    LiveAPI.from(livePath.liveSet).call(
      "move_device",
      "id t0d0",
      "id nobody",
      0,
    );

    expect(lookupMockObject("t0d0")?.path).toBe("live_set tracks 0 devices 0");
  });
});

describe("what a delete and a create leave behind", () => {
  it("empties the last place once a delete closes up", () => {
    setUpTracks(3);
    simulateMockDeletes();

    LiveAPI.from(livePath.liveSet).call("delete_track", 1);

    expect(LiveAPI.from("live_set tracks 1").exists()).toBe(true);
    expect(LiveAPI.from("live_set tracks 2").exists()).toBe(false);
  });

  it("empties the last scene's slots too", () => {
    registerMockObject("t0", { path: livePath.track(0) });
    registerMockObject("scene0", { path: livePath.scene(0) });
    registerMockObject("scene1", { path: livePath.scene(1) });
    simulateMockDeletes();

    LiveAPI.from(livePath.liveSet).call("delete_scene", 0);

    expect(LiveAPI.from("live_set scenes 1").exists()).toBe(false);
    expect(LiveAPI.from("live_set tracks 0 clip_slots 1").exists()).toBe(false);
  });

  it("sets has_clip when a clip is made in a slot and clears it on delete", () => {
    const slot = registerMockObject("slot", {
      path: livePath.track(0).clipSlot(0),
      properties: { has_clip: 0 },
    });

    simulateMockDeletes();

    const api = LiveAPI.from(livePath.track(0).clipSlot(0));

    api.call("create_clip", 4);

    expect(slot.get("has_clip")).toStrictEqual([1]);

    api.call("delete_clip");

    expect(slot.get("has_clip")).toStrictEqual([0]);
    expect(
      lookupMockObject(undefined, "live_set tracks 0 clip_slots 0 clip"),
    ).toBeUndefined();
  });

  it("gives a new track a clip slot for every scene", () => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { scenes: children("a", "b") },
    });

    LiveAPI.from(livePath.liveSet).call("create_midi_track", 0);

    const slots = (lookupMockObject("90001")?.properties.clip_slots ??
      []) as string[];

    expect(slots.filter((_, i) => i % 2 === 1)).toHaveLength(2);
    expect(
      lookupMockObject(undefined, "live_set tracks 0 clip_slots 1"),
    ).toBeDefined();
  });

  it("hands out ids from 90001 up, none burned by a delete", () => {
    setUpTracks(2);
    simulateMockDeletes();

    const liveSet = LiveAPI.from(livePath.liveSet);

    liveSet.call("delete_track", 0);

    expect(liveSet.call("create_midi_track", -1)).toStrictEqual([
      "id",
      "90001",
    ]);
  });
});
