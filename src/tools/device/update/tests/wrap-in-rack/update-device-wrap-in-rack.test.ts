// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  mockNonExistentObjects,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import {
  INSERT_DEVICE_FAILURE,
  followMoves,
  registerAudioEffectDevice,
  registerGrowingChainRack,
  registerInstrumentDevice,
  registerTrackingChain,
  registerTempTrackMocks,
  registerThrowingTrack0,
  registerTrack0,
} from "./update-device-wrap-in-rack-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateDevice - wrapInRack", () => {
  let track0: RegisteredMockObject;
  let liveSet: RegisteredMockObject;
  let newRack: RegisteredMockObject;

  beforeEach(() => {
    track0 = registerTrack0();

    // Audio effects on track 0
    registerAudioEffectDevice("device-0", 0);
    registerAudioEffectDevice("device-1", 1);
    // MIDI effect
    registerMockObject("device-2", {
      path: livePath.track(0).device(2),
      type: "RackDevice",
      properties: { type: 4 },
    });

    // New rack created by insert_device. A freshly created rack starts with
    // one chain, matching Live's real behavior — deviceCount is read back off
    // this list, not echoed from the input, so it has to reflect reality.
    newRack = registerMockObject("new-rack", {
      path: "new-rack",
      type: "RackDevice",
      properties: { chains: children("chain-0") },
      methods: { insert_chain: () => ["id", "new-chain"] },
    });

    // live_set for move operations; the rack's chain holds what it moves in
    liveSet = registerMockObject("live-set", { path: "live_set" });
    registerTrackingChain(liveSet);
    followMoves(liveSet, track0, undefined, [
      "device-0",
      "device-1",
      "device-2",
    ]);
  });

  it("should wrap a single audio effect in an Audio Effect Rack", () => {
    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
    });

    // Should create Audio Effect Rack at device position
    expect(track0.call).toHaveBeenCalledWith(
      "insert_device",
      "Audio Effect Rack",
      0,
    );

    // Should move device into rack
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-0",
      "id chain-0",
      0,
    );

    // With no name option, the rack name is left untouched. (Checked via call
    // args, not expect.anything(), which ignores an undefined value.)
    expect(
      newRack.set.mock.calls.filter((c: unknown[]) => c[0] === "name"),
    ).toHaveLength(0);

    expect(result).toStrictEqual({
      id: "new-rack",
      type: "audio-effect-rack",
      deviceCount: 1,
    });
  });

  it("should report the new rack's path in the result", () => {
    registerMockObject("new-rack", { path: livePath.track(0).device(9) });

    const result = updateDevice({ path: "t0/d0", wrapInRack: true });

    expect((result as Record<string, unknown>).path).toBe("t0/d9");
  });

  it("should wrap a single MIDI effect in a MIDI Effect Rack", () => {
    const result = updateDevice({
      path: "t0/d2",
      wrapInRack: true,
    });

    // Should create MIDI Effect Rack
    expect(track0.call).toHaveBeenCalledWith(
      "insert_device",
      "MIDI Effect Rack",
      2,
    );

    expect(result).toStrictEqual({
      id: "new-rack",
      type: "midi-effect-rack",
      deviceCount: 1,
    });
  });

  describe("instrument wrapping", () => {
    beforeEach(() => {
      // Instrument devices
      registerInstrumentDevice("device-3", 3);
      registerInstrumentDevice("device-4", 4);

      // Override track0 to support insert_device
      track0 = registerTrack0();

      // New rack starts with no chains and grows as chains are inserted
      newRack = registerGrowingChainRack(0);

      // live_set for move/create/delete operations, plus the temp track it
      // creates for instrument wrapping
      liveSet = registerTempTrackMocks();
      registerTrackingChain(liveSet);
      followMoves(liveSet, track0, undefined, [
        "device-0",
        "device-1",
        "device-2",
        "device-3",
        "device-4",
      ]);
    });

    it("should wrap a single instrument in an Instrument Rack", () => {
      const result = updateDevice({
        path: "t0/d3",
        wrapInRack: true,
      });

      // Should create temp track
      expect(liveSet.call).toHaveBeenCalledWith("create_midi_track", -1);

      // Should move instrument to temp track
      expect(liveSet.call).toHaveBeenCalledWith(
        "move_device",
        "id device-3",
        "id temp-track",
        0,
      );

      // Should create Instrument Rack at device position
      expect(track0.call).toHaveBeenCalledWith(
        "insert_device",
        "Instrument Rack",
        3,
      );

      // Should delete temp track
      expect(liveSet.call).toHaveBeenCalledWith(
        "delete_track",
        expect.any(Number),
      );

      expect(result).toStrictEqual({
        id: "new-rack",
        type: "instrument-rack",
        deviceCount: 1,
      });
    });

    it("should report the new rack's path in the result", () => {
      // A distinct path stands in for where the rack lands, since the original
      // device's own path is still registered and mustn't be displaced by it.
      registerMockObject("new-rack", { path: livePath.track(0).device(9) });

      const result = updateDevice({ path: "t0/d3", wrapInRack: true });

      expect((result as Record<string, unknown>).path).toBe("t0/d9");
    });

    it("should refuse to wrap more than one instrument, before staging anything", () => {
      // Live allows only one instrument per track, so a second move_device onto
      // the staging track would silently no-op — refuse up front instead.
      expect(() =>
        updateDevice({
          path: "t0/d3,t0/d4",
          wrapInRack: true,
        }),
      ).toThrow(
        'wrapInRack can wrap only one instrument at a time; 2 named: path "t0/d3", path "t0/d4"',
      );

      // Nothing should have been staged or created.
      expect(liveSet.call).not.toHaveBeenCalledWith("create_midi_track", -1);
      expect(track0.call).not.toHaveBeenCalledWith(
        "insert_device",
        expect.anything(),
        expect.anything(),
      );
    });

    it("should set rack name for instrument rack", () => {
      const result = updateDevice({
        path: "t0/d3",
        wrapInRack: true,
        name: "My Instrument Rack",
      });

      expect(newRack.set).toHaveBeenCalledWith("name", "My Instrument Rack");

      const r = result as Record<string, unknown>;

      expect(r.id).toBe("new-rack");
      expect(r.type).toBe("instrument-rack");
    });

    it("refuses an instrument wrap whose toPath container is not there", () => {
      mockNonExistentObjects();

      // Re-register the instrument device so it can be resolved
      registerInstrumentDevice("device-3", 3);
      registerMockObject("track-0", {
        path: livePath.track(0),
      });
      const liveSetMock = registerTempTrackMocks();

      expect(() =>
        updateDevice({ path: "t0/d3", wrapInRack: true, toPath: "t99" }),
      ).toThrow('nothing at toPath "t99"');
      expect(capturedWarnings()).toStrictEqual([]);
      // The check runs before anything is staged, so no temp track is made.
      expect(liveSetMock.call).not.toHaveBeenCalledWith(
        "create_midi_track",
        -1,
      );
    });

    it("refuses an instrument wrap for a toPath that won't resolve", () => {
      // Same as the effect wrap, but this branch stages instruments on a temp
      // track — so the bad toPath has to stop it before anything moves.
      mockNonExistentObjects();
      registerInstrumentDevice("device-3", 3);
      registerMockObject("track-0", { path: livePath.track(0) });

      const liveSetMock = registerTempTrackMocks();

      expect(() =>
        updateDevice({ path: "t0/d3", wrapInRack: true, toPath: "garbage" }),
      ).toThrow("invalid toPath");
      expect(capturedWarnings()).toStrictEqual([]);
      expect(liveSetMock.call).not.toHaveBeenCalledWith(
        "create_midi_track",
        -1,
      );
    });

    it("should cleanup temp track when instrument wrap throws and cleanup succeeds", () => {
      // Make insert_device throw to trigger the catch block
      track0 = registerThrowingTrack0();

      // Cleanup (delete_track) succeeds
      liveSet = registerTempTrackMocks();

      expect(() =>
        updateDevice({
          path: "t0/d3",
          wrapInRack: true,
        }),
      ).toThrow(INSERT_DEVICE_FAILURE);

      // Verify cleanup was attempted
      expect(liveSet.call).toHaveBeenCalledWith(
        "delete_track",
        expect.any(Number),
      );
    });

    it("should restore the staged instrument to the source before deleting the temp track on failure", () => {
      // insert_device throws after the instrument is staged on the temp track
      track0 = registerThrowingTrack0();

      expect(() => updateDevice({ path: "t0/d3", wrapInRack: true })).toThrow(
        INSERT_DEVICE_FAILURE,
      );

      // Moved back to track 0, slot 3, rather than deleted with the temp track
      expect(liveSet.call).toHaveBeenCalledWith(
        "move_device",
        "id device-3",
        "id track-0",
        3,
      );
      expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
    });

    it("should cleanup temp track when instrument wrap throws and cleanup also fails", () => {
      // Make insert_device throw to trigger the catch block
      track0 = registerThrowingTrack0();

      // Make delete_track throw during cleanup
      liveSet = registerMockObject("live-set", {
        path: "live_set",
        methods: {
          create_midi_track: () => ["id", "temp-track"],
          delete_track: () => {
            throw new Error("delete_track cleanup failed");
          },
        },
      });

      registerMockObject("temp-track", {
        path: livePath.track(1),
      });

      // The original error should propagate, not the cleanup error
      expect(() =>
        updateDevice({
          path: "t0/d3",
          wrapInRack: true,
        }),
      ).toThrow(INSERT_DEVICE_FAILURE);
    });

    it("appends the instrument rack for a toPath with no index", () => {
      // toPath "t2" names no index, so the rack goes on the end, like a move.
      const destTrack = registerMockObject("dest-track", {
        path: livePath.track(2),
        methods: { insert_device: () => ["id", "new-rack"] },
      });

      const result = updateDevice({
        path: "t0/d3",
        wrapInRack: true,
        toPath: "t2",
      });

      expect(destTrack.call).toHaveBeenCalledWith(
        "insert_device",
        "Instrument Rack",
      );
      expect((result as Record<string, unknown>).id).toBe("new-rack");
    });

    it("keeps the temp track when the instrument can't go back", () => {
      registerThrowingTrack0();
      // Live ignores the move back to track 0.
      liveSet = registerTempTrackMocks((_id, to) => to === "id track-0");

      expect(() => updateDevice({ path: "t0/d3", wrapInRack: true })).toThrow(
        `${INSERT_DEVICE_FAILURE}; the instrument was left on new track t1`,
      );
      expect(liveSet.call).not.toHaveBeenCalledWith("delete_track", 1);
    });
  });

  it("refuses a wrap mixing MIDI and audio effects", () => {
    expect(() =>
      updateDevice({ path: "t0/d0,t0/d2", wrapInRack: true }),
    ).toThrow(
      "wrapInRack cannot mix MIDI and audio effects in one rack without an instrument",
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses update args a wrap would ignore, before touching anything", () => {
    expect(() =>
      updateDevice({
        path: "t0/d0",
        wrapInRack: true,
        name: "Rack",
        toPath: "t0/d0",
        params: [{ name: "Gain", value: "1" }],
        macroCount: 4,
        color: "#FF0000",
        mute: false,
      }),
    ).toThrow(
      "wrapInRack cannot be used with params, macroCount, mute, color: wrap first, then update in another call",
    );
    expect(track0.call).not.toHaveBeenCalledWith(
      "insert_device",
      expect.anything(),
      expect.anything(),
    );
  });

  it("refuses a wrap's ignored args before checking them on their own", () => {
    expect(() =>
      updateDevice({ path: "t0/d0", wrapInRack: true, sendGainDb: -3 }),
    ).toThrow("wrapInRack cannot be used with sendGainDb");
  });

  it("wraps anyway when the other args set nothing", () => {
    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
      force: false,
      params: [],
      actions: [],
      sends: [],
    });

    expect(track0.call).toHaveBeenCalledWith(
      "insert_device",
      "Audio Effect Rack",
      0,
    );
    expect(result).toStrictEqual({
      id: "new-rack",
      type: "audio-effect-rack",
      deviceCount: 1,
    });
  });

  it.each(["t1", "t1/d+"])(
    "appends the rack to the toPath %s, which names no index",
    (toPath) => {
      const track1 = registerMockObject("track-1", {
        path: livePath.track(1),
        methods: { insert_device: () => ["id", "new-rack"] },
      });

      const result = updateDevice({ path: "t0/d0", wrapInRack: true, toPath });

      // No index means append; index 0 would put the rack first
      expect(track1.call).toHaveBeenCalledWith(
        "insert_device",
        "Audio Effect Rack",
      );
      expect((result as Record<string, unknown>).id).toBe("new-rack");
    },
  );

  it("inserts the rack at the index a toPath names", () => {
    const track1 = registerMockObject("track-1", {
      path: livePath.track(1),
      methods: { insert_device: () => ["id", "new-rack"] },
    });

    updateDevice({ path: "t0/d0", wrapInRack: true, toPath: "t1/d1" });

    expect(track1.call).toHaveBeenCalledWith(
      "insert_device",
      "Audio Effect Rack",
      1,
    );
  });

  it("should set rack name when provided", () => {
    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
      name: "My Effect Rack",
    });

    // The provided name is written to the newly created rack.
    expect(newRack.set).toHaveBeenCalledWith("name", "My Effect Rack");

    const r = result as Record<string, unknown>;

    expect(r.id).toBe("new-rack");
    expect(r.type).toBe("audio-effect-rack");
  });

  it("should work with device IDs", () => {
    const result = updateDevice({
      id: "device-0",
      wrapInRack: true,
    });

    expect(result).toStrictEqual({
      id: "new-rack",
      type: "audio-effect-rack",
      deviceCount: 1,
    });
  });

  // Nothing was wrapped, so there is no rack entry to carry why.
  it.each([
    ["nonexistent id", { id: "nonexistent" }, 'no device at "nonexistent"'],
    ["missing container", { path: "t99/d0" }, 'no device at "t99/d0"'],
    [
      "c+ path",
      { path: "t0/d0/c+" },
      'invalid path "t0/d0/c+" - "c+" appends a chain, which only ppal-create-device, ppal-duplicate and ppal-update-device do',
    ],
    // No rack at t0/d0, so the pad names nothing.
    [
      "unresolvable drum-pad container",
      { path: "t0/d0/pC1/d0" },
      'no device at "t0/d0/pC1/d0"',
    ],
  ])("should refuse a wrap of a %s", (_label, args, reason) => {
    mockNonExistentObjects();

    expect(() => updateDevice({ ...args, wrapInRack: true })).toThrow(
      `wrapInRack found no devices to wrap: ${reason}`,
    );
  });

  it("refuses a wrap whose toPath container is not there", () => {
    mockNonExistentObjects();

    expect(() =>
      updateDevice({ path: "t0/d0", wrapInRack: true, toPath: "t99" }),
    ).toThrow('nothing at toPath "t99"');
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("should refuse a wrap for a path that won't resolve", () => {
    mockNonExistentObjects();

    expect(() =>
      updateDevice({ path: "t0/d0/c0/d0", wrapInRack: true }),
    ).toThrow(
      'wrapInRack found no devices to wrap: no device at "t0/d0/c0/d0"',
    );
  });

  // A wrap makes one rack, so a toPath naming nowhere to put it leaves nothing
  // to report on — unlike the sibling move, which skips and carries on.
  it.each([
    ["t99/d0/c0", 'Track in path "t99/d0/c0" does not exist'],
    ["t0/d5/c0", 'Device in path "t0/d5/c0" does not exist'],
    ["garbage", "invalid toPath"],
    ["t0/d0/c0", 'Device at path "t0/d0/c0" does not support chains'],
  ])("refuses the wrap for the toPath %s", (toPath, reason) => {
    mockNonExistentObjects();

    expect(() =>
      updateDevice({ id: "device-0", wrapInRack: true, toPath }),
    ).toThrow(reason);
    expect(capturedWarnings()).toStrictEqual([]);
    expect(track0.call).not.toHaveBeenCalledWith(
      "insert_device",
      expect.anything(),
      expect.anything(),
    );
  });

  it("refuses a wrap of a device that is no kind of effect", () => {
    registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { type: 0 },
    });

    expect(() => updateDevice({ path: "t0/d0", wrapInRack: true })).toThrow(
      "wrapInRack found no effect devices to wrap",
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("should refuse a wrap of the Producer Pal device", () => {
    registerMockObject("this_device", { path: livePath.track(0).device(0) });

    expect(() => updateDevice({ id: "device-0", wrapInRack: true })).toThrow(
      "wrapInRack found no devices to wrap: the Producer Pal device " +
        "t0/d0 (id device-0) cannot be wrapped",
    );
  });

  it("should refuse a wrap when an id resolves to a non-device object", () => {
    // The object exists but its type doesn't end in "Device" (e.g. a Chain),
    // so there is nothing to wrap.
    registerMockObject("not-a-device", { path: "some/path", type: "Chain" });

    expect(() =>
      updateDevice({ id: "not-a-device", wrapInRack: true }),
    ).toThrow(
      'wrapInRack found no devices to wrap: "not-a-device" is a chain, not a device',
    );
  });

  it("says on the rack's entry which devices did not make it in", () => {
    registerMockObject("not-a-device", { path: "some/path", type: "Chain" });

    expect(
      updateDevice({ path: "t0/d0", id: "not-a-device", wrapInRack: true }),
    ).toStrictEqual(
      expect.objectContaining({
        detail: '"not-a-device" is a chain, not a device',
      }),
    );
  });

  it("says on the rack's entry when Live makes no chain for a device", () => {
    // Override rack to have no pre-existing chains and fail on insert_chain
    newRack.get.mockImplementation((prop: string) => {
      if (prop === "chains") {
        return [];
      }

      return [0];
    });
    newRack.call.mockImplementation((method: string) => {
      if (method === "insert_chain") {
        return 1;
      } // Failure

      return null;
    });

    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
    });

    // deviceCount is read back from the rack's actual chains, not echoed from
    // the input — since the chain was never created, it reports 0, not 1.
    // The device that had nowhere to go says so on the rack's entry.
    expect(result).toStrictEqual({
      deviceCount: 0,
      id: "new-rack",
      type: "audio-effect-rack",
      detail:
        'path "t0/d0" stayed put: Live made no chain for it; the new rack was left empty',
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("treats a non-id insert_chain answer as no chain made", () => {
    // A returned array whose first element isn't "id" also counts as a failure.
    newRack.get.mockImplementation((prop: string) =>
      prop === "chains" ? [] : [0],
    );
    newRack.call.mockImplementation((method: string) =>
      method === "insert_chain" ? ["oops"] : null,
    );

    const result = updateDevice({ path: "t0/d0", wrapInRack: true });

    // Read back, not echoed: the chain was never created, so this reports 0.
    expect(result).toStrictEqual({
      deviceCount: 0,
      id: "new-rack",
      type: "audio-effect-rack",
      detail:
        'path "t0/d0" stayed put: Live made no chain for it; the new rack was left empty',
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("should refuse a path that resolves to a container, not a device", () => {
    expect(() => updateDevice({ path: "t0", wrapInRack: true })).toThrow(
      'invalid path "t0" - a track is not a device',
    );
  });

  it("should create a chain when the rack starts with none", () => {
    // Rack with no pre-existing chains; insert_chain succeeds and the rack's
    // chain list grows, so the deviceCount read-back sees it.
    newRack = registerGrowingChainRack(0);
    const result = updateDevice({ path: "t0/d0", wrapInRack: true });

    expect(result).toStrictEqual({
      deviceCount: 1,
      id: "new-rack",
      type: "audio-effect-rack",
    });
  });

  it("defaults the insertion position to 0 when the device path has no index", () => {
    // A device whose path lacks a trailing "devices N" segment falls back to 0.
    const oddDevice = registerMockObject("odd-device", {
      path: "live_set tracks 5",
      type: "Device",
      properties: { type: 2, devices: children("odd-device") },
      methods: { insert_device: () => ["id", "new-rack"] },
    });

    const result = updateDevice({ id: "odd-device", wrapInRack: true });

    expect(oddDevice.call).toHaveBeenCalledWith(
      "insert_device",
      "Audio Effect Rack",
      0,
    );
    expect((result as Record<string, unknown>).id).toBe("new-rack");
  });
});
