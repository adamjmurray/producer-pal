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
} from "./update-device-test-helpers.ts";
import {
  INSERT_DEVICE_FAILURE,
  registerAudioEffectDevice,
  registerGrowingChainRack,
  registerInstrumentDevice,
  registerRackChains,
  registerTempTrackMocks,
  registerThrowingTrack0,
  registerTrack0,
} from "./update-device-wrap-in-rack-test-helpers.ts";

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

    // New rack created by insert_device
    newRack = registerMockObject("new-rack", {
      path: "new-rack",
      type: "RackDevice",
      properties: { chains: children("chain-0", "chain-1") },
      methods: { insert_chain: () => ["id", "new-chain"] },
    });

    // Chains inside the rack (paths match ${rack.path} chains ${i})
    registerRackChains(2);

    // live_set for move operations
    liveSet = registerMockObject("live-set", { path: "live_set" });
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

  it("should wrap multiple audio effects into one rack with multiple chains", () => {
    const result = updateDevice({
      path: "t0/d0,t0/d1",
      wrapInRack: true,
    });

    // Should create Audio Effect Rack at first device's position
    expect(track0.call).toHaveBeenCalledWith(
      "insert_device",
      "Audio Effect Rack",
      0,
    );

    // Should move both devices into separate chains
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-0",
      "id chain-0",
      0,
    );
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-1",
      "id chain-1",
      0,
    );

    expect(result).toStrictEqual({
      id: "new-rack",
      type: "audio-effect-rack",
      deviceCount: 2,
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

      // Register chains (paths match ${rack.path} chains ${i})
      registerRackChains(2);
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

    it("should wrap multiple instruments into rack with multiple chains", () => {
      const result = updateDevice({
        path: "t0/d3,t0/d4",
        wrapInRack: true,
      });

      // Should create Instrument Rack
      expect(track0.call).toHaveBeenCalledWith(
        "insert_device",
        "Instrument Rack",
        3,
      );

      // One chain is inserted per instrument (the reverse loop runs exactly
      // deviceCount times) — a bound-off mutant makes too few or too many.
      const insertChainCalls = newRack.call.mock.calls.filter(
        (c: unknown[]) => c[0] === "insert_chain",
      );

      expect(insertChainCalls).toHaveLength(2);

      expect(result).toStrictEqual({
        id: "new-rack",
        type: "instrument-rack",
        deviceCount: 2,
      });
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

    it("should throw when toPath container does not exist for instrument wrap", () => {
      mockNonExistentObjects();

      // Re-register the instrument device so it can be resolved
      registerInstrumentDevice("device-3", 3);
      registerMockObject("track-0", {
        path: livePath.track(0),
      });
      registerTempTrackMocks();

      expect(() =>
        updateDevice({
          path: "t0/d3",
          wrapInRack: true,
          toPath: "t99",
        }),
      ).toThrow("target container does not exist");
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

    it("should restore stranded instruments to the source before deleting the temp track on failure", () => {
      // insert_device throws after the instrument is staged on the temp track
      track0 = registerThrowingTrack0();

      liveSet = registerTempTrackMocks();

      // Temp track now holds the staged instrument (one device in slot 0)
      registerMockObject("temp-track", {
        path: livePath.track(1),
        properties: { devices: children("device-3-on-temp") },
      });
      registerMockObject("device-3-on-temp", {
        path: livePath.track(1).device(0),
        type: "RackDevice",
        properties: { type: 1 },
      });

      expect(() =>
        updateDevice({
          path: "t0/d3",
          wrapInRack: true,
        }),
      ).toThrow(INSERT_DEVICE_FAILURE);

      // The stranded instrument is moved back to its original container
      // (track 0, position 3) rather than being deleted with the temp track
      expect(liveSet.call).toHaveBeenCalledWith(
        "move_device",
        "id device-3-on-temp",
        "id track-0",
        3,
      );

      // And the temp track is still cleaned up afterward
      expect(liveSet.call).toHaveBeenCalledWith(
        "delete_track",
        expect.any(Number),
      );
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

    it("defaults the instrument-rack insert position to 0 for an append toPath", () => {
      // toPath "t2" is a track (append), so resolveInsertionPath returns a null
      // position and insert_device falls back to 0.
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
        0,
      );
      expect((result as Record<string, unknown>).id).toBe("new-rack");
    });

    it("stops restoring stranded instruments when a temp-track slot is empty", () => {
      // With unregistered objects non-existent, the temp track reports a device
      // but its slot 0 resolves to nothing, so the restore loop breaks at once.
      mockNonExistentObjects();
      registerInstrumentDevice("device-3", 3);
      registerThrowingTrack0();
      liveSet = registerTempTrackMocks();
      registerMockObject("temp-track", {
        path: livePath.track(1),
        properties: { devices: children("phantom-device") },
      });

      expect(() => updateDevice({ path: "t0/d3", wrapInRack: true })).toThrow(
        INSERT_DEVICE_FAILURE,
      );

      // The temp track is still cleaned up after the (no-op) restore.
      expect(liveSet.call).toHaveBeenCalledWith(
        "delete_track",
        expect.any(Number),
      );
    });
  });

  it("should warn and return null when mixing MIDI and Audio effects", () => {
    const result = updateDevice({
      path: "t0/d0,t0/d2",
      wrapInRack: true,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "wrapInRack: cannot mix MIDI and Audio effects in one rack",
    );
    expect(result).toBeNull();
  });

  it("should place rack at toPath when provided", () => {
    const track1 = registerMockObject("track-1", {
      path: livePath.track(1),
      methods: { insert_device: () => ["id", "new-rack"] },
    });

    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
      toPath: "t1",
    });

    // Should create rack on track 1, not track 0
    expect(track1.call).toHaveBeenCalledWith(
      "insert_device",
      "Audio Effect Rack",
      expect.any(Number),
    );

    expect((result as Record<string, unknown>).id).toBe("new-rack");
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
      ids: "device-0",
      wrapInRack: true,
    });

    expect(result).toStrictEqual({
      id: "new-rack",
      type: "audio-effect-rack",
      deviceCount: 1,
    });
  });

  it("should warn and return null when no devices found", () => {
    mockNonExistentObjects();

    const result = updateDevice({
      ids: "nonexistent",
      wrapInRack: true,
    });

    // The unresolved id is reported, then the empty set aborts the wrap.
    expect(outlet).toHaveBeenCalledWith(
      1,
      'wrapInRack: device not found at "nonexistent"',
    );
    expect(outlet).toHaveBeenCalledWith(1, "wrapInRack: no devices found");
    expect(result).toBeNull();
  });

  it("should warn and return null when the device path's container is missing", () => {
    mockNonExistentObjects();

    const result = updateDevice({ path: "t99/d0", wrapInRack: true });

    expect(outlet).toHaveBeenCalledWith(
      1,
      'wrapInRack: device not found at "t99/d0"',
    );
    expect(result).toBeNull();
  });

  it("should warn and return null when a drum-pad container can't be resolved", () => {
    // "pC1" under a device that is not a Drum Rack: resolveContainer yields
    // null, which is a different miss from the device simply not existing.
    mockNonExistentObjects();

    const result = updateDevice({ path: "t0/d0/pC1/d0", wrapInRack: true });

    expect(outlet).toHaveBeenCalledWith(
      1,
      'wrapInRack: device not found at "t0/d0/pC1/d0"',
    );
    expect(result).toBeNull();
  });

  it("should warn and return null when toPath container does not exist", () => {
    mockNonExistentObjects();

    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
      toPath: "t99",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "wrapInRack: target container does not exist",
    );
    expect(result).toBeNull();
  });

  it("should warn and return null when device type is unrecognized", () => {
    registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { type: 0 },
    });

    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "wrapInRack: no valid effect devices found",
    );
    expect(result).toBeNull();
  });

  it("should warn and return null when an id resolves to a non-device object", () => {
    // The object exists but its type doesn't end in "Device" (e.g. a Chain),
    // so resolveDevices warns "is not a device" and skips it -> no devices.
    registerMockObject("not-a-device", {
      path: "some/path",
      type: "Chain",
    });

    const result = updateDevice({
      ids: "not-a-device",
      wrapInRack: true,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      'wrapInRack: "not-a-device" is not a device (type: Chain)',
    );
    expect(result).toBeNull();
  });

  it("should warn but continue when insert_chain fails", () => {
    // Override rack to have no pre-existing chains and fail on insert_chain
    newRack.get.mockImplementation((prop: string) => {
      if (prop === "chains") return [];

      return [0];
    });
    newRack.call.mockImplementation((method: string) => {
      if (method === "insert_chain") return 1; // Failure

      return null;
    });

    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
    });

    // The failed chain insertion is reported (1/1), but the wrap continues.
    expect(outlet).toHaveBeenCalledWith(
      1,
      "wrapInRack: failed to create chain 1/1",
    );

    // Result contains rack info even if chain creation failed
    expect(result).toMatchObject({
      id: "new-rack",
      type: "audio-effect-rack",
    });
  });

  it("should warn but continue when insert_chain returns a non-id array", () => {
    // A returned array whose first element isn't "id" also counts as a failure.
    newRack.get.mockImplementation((prop: string) =>
      prop === "chains" ? [] : [0],
    );
    newRack.call.mockImplementation((method: string) =>
      method === "insert_chain" ? ["oops"] : null,
    );

    const result = updateDevice({ path: "t0/d0", wrapInRack: true });

    // A returned array whose head isn't "id" is treated as a failure and warned.
    expect(outlet).toHaveBeenCalledWith(
      1,
      "wrapInRack: failed to create chain 1/1",
    );

    expect(result).toMatchObject({
      id: "new-rack",
      type: "audio-effect-rack",
    });
  });

  it("should return null for a path that resolves to a container, not a device", () => {
    // "t0" (no device index) resolves to the track container itself; a Track is
    // not a device, so there is nothing to wrap.
    expect(updateDevice({ path: "t0", wrapInRack: true })).toBeNull();
  });

  it("should create a chain when the rack starts with none", () => {
    // Rack with no pre-existing chains; insert_chain succeeds with a valid id.
    newRack.get.mockImplementation((prop: string) =>
      prop === "chains" ? [] : [0],
    );
    newRack.call.mockImplementation((method: string) =>
      method === "insert_chain" ? ["id", "new-chain"] : null,
    );

    const result = updateDevice({ path: "t0/d0", wrapInRack: true });

    expect(result).toMatchObject({ id: "new-rack", type: "audio-effect-rack" });
  });

  it("defaults the insertion position to 0 when the device path has no index", () => {
    // A device whose path lacks a trailing "devices N" segment falls back to 0.
    const oddDevice = registerMockObject("odd-device", {
      path: "live_set tracks 5",
      type: "Device",
      properties: { type: 2 },
      methods: { insert_device: () => ["id", "new-rack"] },
    });

    const result = updateDevice({ ids: "odd-device", wrapInRack: true });

    expect(oddDevice.call).toHaveBeenCalledWith(
      "insert_device",
      "Audio Effect Rack",
      0,
    );
    expect((result as Record<string, unknown>).id).toBe("new-rack");
  });
});
