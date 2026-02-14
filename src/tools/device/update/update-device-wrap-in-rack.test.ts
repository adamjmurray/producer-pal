// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "./update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateDevice - wrapInRack", () => {
  let track0: RegisteredMockObject;
  let liveSet: RegisteredMockObject;
  let newRack: RegisteredMockObject;

  beforeEach(() => {
    track0 = registerMockObject("track-0", {
      path: livePath.track(0),
      methods: { insert_device: () => ["id", "new-rack"] },
    });

    // Audio effects on track 0
    registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "AudioEffectDevice",
      properties: { type: 2 },
    });
    registerMockObject("device-1", {
      path: livePath.track(0).device(1),
      type: "AudioEffectDevice",
      properties: { type: 2 },
    });
    // MIDI effect
    registerMockObject("device-2", {
      path: livePath.track(0).device(2),
      type: "MidiEffectDevice",
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
    registerMockObject("chain-0", { type: "Chain", path: "new-rack chains 0" });
    registerMockObject("chain-1", { type: "Chain", path: "new-rack chains 1" });

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
      let chainCount = 0;

      // Instrument devices
      registerMockObject("device-3", {
        path: livePath.track(0).device(3),
        type: "InstrumentDevice",
        properties: { type: 1 },
      });
      registerMockObject("device-4", {
        path: livePath.track(0).device(4),
        type: "InstrumentDevice",
        properties: { type: 1 },
      });

      // Temp track for instrument wrapping
      registerMockObject("temp-track", {
        path: livePath.track(1),
      });

      // Override track0 to support insert_device
      track0 = registerMockObject("track-0", {
        path: livePath.track(0),
        methods: { insert_device: () => ["id", "new-rack"] },
      });

      // New rack with dynamic chain counting
      newRack = registerMockObject("new-rack", {
        path: "new-rack",
        type: "RackDevice",
        properties: {
          chains: [], // starts empty, grows as chains are inserted
        },
      });
      newRack.get.mockImplementation((prop: string) => {
        if (prop === "chains") {
          const chains = [];

          for (let i = 0; i < chainCount; i++) {
            chains.push("id", `chain-${i}`);
          }

          return chains;
        }

        return [0];
      });
      newRack.call.mockImplementation((method: string) => {
        if (method === "insert_chain") {
          chainCount++;

          return ["id", `chain-${chainCount - 1}`];
        }

        return null;
      });

      // live_set for move/create/delete operations
      liveSet = registerMockObject("live-set", {
        path: "live_set",
        methods: {
          create_midi_track: () => ["id", "temp-track"],
          delete_track: () => null,
        },
      });

      // Register chains (paths match ${rack.path} chains ${i})
      registerMockObject("chain-0", {
        type: "Chain",
        path: "new-rack chains 0",
      });
      registerMockObject("chain-1", {
        type: "Chain",
        path: "new-rack chains 1",
      });
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

      const r = result as Record<string, unknown>;

      expect(r.id).toBe("new-rack");
      expect(r.type).toBe("instrument-rack");
    });
  });

  it("should warn and return null when mixing MIDI and Audio effects", () => {
    const result = updateDevice({
      path: "t0/d0,t0/d2",
      wrapInRack: true,
    });

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

    expect(result).toBeNull();
  });

  it("should warn and return null when toPath container does not exist", () => {
    mockNonExistentObjects();

    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
      toPath: "t99",
    });

    expect(result).toBeNull();
  });

  it("should warn and return null when device type is unrecognized", () => {
    registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "UnknownDevice",
      properties: { type: 0 },
    });

    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
    });

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

    // Result contains rack info even if chain creation failed
    expect(result).toMatchObject({
      id: "new-rack",
      type: "audio-effect-rack",
    });
  });
});
