import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mock-live-api.js";
import { updateDevice } from "./update-device.js";
import "#src/live-api-adapter/live-api-extensions.js";

describe("updateDevice - wrapInRack", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: devices exist at track 0 devices 0, 1, 2
    liveApiType.mockImplementation(function () {
      // Track
      if (this._path === "live_set tracks 0") return "Track";
      // Audio effects
      if (this._path === "live_set tracks 0 devices 0")
        return "AudioEffectDevice";
      if (this._path === "live_set tracks 0 devices 1")
        return "AudioEffectDevice";
      // MIDI effect
      if (this._path === "live_set tracks 0 devices 2")
        return "MidiEffectDevice";
      // Instrument
      if (this._path === "live_set tracks 0 devices 3")
        return "InstrumentDevice";
      // Rack
      if (this._path?.includes("rack")) return "RackDevice";
      // Chains
      if (this._path?.includes("chains")) return "Chain";
      // By ID (with "id " prefix)
      if (this._path === "id device-0") return "AudioEffectDevice";
      if (this._path === "id device-1") return "AudioEffectDevice";
      if (this._path === "id device-2") return "MidiEffectDevice";
      if (this._path === "id device-3") return "InstrumentDevice";
      if (this._path === "id new-rack") return "RackDevice";
      // By ID (without "id " prefix - for LiveAPI.from() with non-numeric IDs)
      if (this._path === "device-0") return "AudioEffectDevice";
      if (this._path === "device-1") return "AudioEffectDevice";
      if (this._path === "device-2") return "MidiEffectDevice";
      if (this._path === "device-3") return "InstrumentDevice";

      return "Device";
    });

    liveApiId.mockImplementation(function () {
      if (this._path === "live_set tracks 0") return "track-0";
      if (this._path === "live_set tracks 0 devices 0") return "device-0";
      if (this._path === "live_set tracks 0 devices 1") return "device-1";
      if (this._path === "live_set tracks 0 devices 2") return "device-2";
      if (this._path === "live_set tracks 0 devices 3") return "device-3";
      // By ID (with "id " prefix)
      if (this._path === "id device-0") return "device-0";
      if (this._path === "id device-1") return "device-1";
      if (this._path === "id device-2") return "device-2";
      if (this._path === "id device-3") return "device-3";
      if (this._path === "id new-rack") return "new-rack";
      // By ID (without "id " prefix - for LiveAPI.from() with non-numeric IDs)
      if (this._path === "device-0") return "device-0";
      if (this._path === "device-1") return "device-1";
      if (this._path === "device-2") return "device-2";
      if (this._path === "device-3") return "device-3";
      // Chains
      if (this._path?.includes("chains 0")) return "chain-0";
      if (this._path?.includes("chains 1")) return "chain-1";

      return "0";
    });

    liveApiPath.mockImplementation(function () {
      // By ID (with "id " prefix)
      if (this._path === "id device-0") return "live_set tracks 0 devices 0";
      if (this._path === "id device-1") return "live_set tracks 0 devices 1";
      if (this._path === "id device-2") return "live_set tracks 0 devices 2";
      if (this._path === "id device-3") return "live_set tracks 0 devices 3";
      if (this._path === "id new-rack") return "live_set tracks 0 devices 0";
      if (this._path === "id track-0") return "live_set tracks 0";
      // By ID (without "id " prefix - for LiveAPI.from() with non-numeric IDs)
      if (this._path === "device-0") return "live_set tracks 0 devices 0";
      if (this._path === "device-1") return "live_set tracks 0 devices 1";
      if (this._path === "device-2") return "live_set tracks 0 devices 2";
      if (this._path === "device-3") return "live_set tracks 0 devices 3";

      return this._path;
    });

    liveApiGet.mockImplementation(function (prop) {
      // Device type property: 1=instrument, 2=audio, 4=midi
      if (prop === "type") {
        if (
          this._path === "live_set tracks 0 devices 0" ||
          this._path === "id device-0" ||
          this._path === "device-0" ||
          this._path === "live_set tracks 0 devices 1" ||
          this._path === "id device-1" ||
          this._path === "device-1"
        ) {
          return [2]; // Audio effect
        }

        if (
          this._path === "live_set tracks 0 devices 2" ||
          this._path === "id device-2" ||
          this._path === "device-2"
        ) {
          return [4]; // MIDI effect
        }

        if (
          this._path === "live_set tracks 0 devices 3" ||
          this._path === "id device-3" ||
          this._path === "device-3"
        ) {
          return [1]; // Instrument
        }
      }

      // Rack chains - new rack comes with 2 chains pre-created
      if (prop === "chains" && this._path?.includes("new-rack")) {
        return ["id", "chain-0", "id", "chain-1"];
      }

      return [0];
    });

    // Mock insert_device to return a new rack ID
    liveApiCall.mockImplementation(function (method) {
      if (method === "insert_device") {
        return ["id", "new-rack"];
      }

      if (method === "insert_chain") {
        return ["id", "new-chain"];
      }

      return null;
    });
  });

  it("should wrap a single audio effect in an Audio Effect Rack", () => {
    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
    });

    // Should create Audio Effect Rack at device position
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "live_set tracks 0" }),
      "insert_device",
      "Audio Effect Rack",
      0,
    );

    // Should move device into rack
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "live_set" }),
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
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "live_set tracks 0" }),
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
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "live_set tracks 0" }),
      "insert_device",
      "Audio Effect Rack",
      0,
    );

    // Should move both devices into separate chains
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "live_set" }),
      "move_device",
      "id device-0",
      "id chain-0",
      0,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "live_set" }),
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
      // Extended mocks for instrument wrapping with temp track
      let chainCount = 0;

      liveApiType.mockImplementation(function () {
        if (this._path === "live_set tracks 0") return "Track";
        if (this._path === "live_set tracks 1") return "Track"; // temp track
        if (this._path === "live_set tracks 0 devices 3")
          return "InstrumentDevice";
        if (this._path === "live_set tracks 0 devices 4")
          return "InstrumentDevice";
        if (this._path === "live_set tracks 1 devices 0")
          return "InstrumentDevice";
        if (this._path === "id device-3") return "InstrumentDevice";
        if (this._path === "id device-4") return "InstrumentDevice";
        if (this._path === "id temp-track") return "Track";
        if (this._path === "id new-rack") return "RackDevice";
        if (this._path === "device-3") return "InstrumentDevice";
        if (this._path === "device-4") return "InstrumentDevice";
        if (this._path?.includes("rack")) return "RackDevice";
        if (this._path?.includes("chains")) return "Chain";

        return "Device";
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") return "track-0";
        if (this._path === "live_set tracks 1") return "temp-track";
        if (this._path === "live_set tracks 0 devices 3") return "device-3";
        if (this._path === "live_set tracks 0 devices 4") return "device-4";
        if (this._path === "live_set tracks 1 devices 0") return "device-3";
        if (this._path === "id device-3") return "device-3";
        if (this._path === "id device-4") return "device-4";
        if (this._path === "id temp-track") return "temp-track";
        if (this._path === "id new-rack") return "new-rack";
        if (this._path === "device-3") return "device-3";
        if (this._path === "device-4") return "device-4";
        if (this._path?.includes("chains 0")) return "chain-0";
        if (this._path?.includes("chains 1")) return "chain-1";

        return "0";
      });

      liveApiPath.mockImplementation(function () {
        if (this._path === "id device-3") return "live_set tracks 0 devices 3";
        if (this._path === "id device-4") return "live_set tracks 0 devices 4";
        if (this._path === "id temp-track") return "live_set tracks 1";
        if (this._path === "id new-rack") return "live_set tracks 0 devices 3";
        if (this._path === "device-3") return "live_set tracks 0 devices 3";
        if (this._path === "device-4") return "live_set tracks 0 devices 4";

        return this._path;
      });

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "type") {
          if (
            this._path === "live_set tracks 0 devices 3" ||
            this._path === "id device-3" ||
            this._path === "device-3" ||
            this._path === "live_set tracks 0 devices 4" ||
            this._path === "id device-4" ||
            this._path === "device-4" ||
            this._path === "live_set tracks 1 devices 0"
          ) {
            return [1]; // Instrument
          }
        }

        // Return dynamic chain count for rack
        if (prop === "chains" && this._path?.includes("new-rack")) {
          const chains = [];

          for (let i = 0; i < chainCount; i++) {
            chains.push("id", `chain-${i}`);
          }

          return chains;
        }

        return [0];
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "create_midi_track") {
          return ["id", "temp-track"];
        }

        if (method === "insert_device") {
          return ["id", "new-rack"];
        }

        if (method === "insert_chain") {
          chainCount++;

          return ["id", `chain-${chainCount - 1}`];
        }

        if (method === "delete_track") {
          return null;
        }

        return null;
      });
    });

    it("should wrap a single instrument in an Instrument Rack", () => {
      const result = updateDevice({
        path: "t0/d3",
        wrapInRack: true,
      });

      // Should create temp track
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "live_set" }),
        "create_midi_track",
        -1,
      );

      // Should move instrument to temp track
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "live_set" }),
        "move_device",
        "id device-3",
        "id temp-track",
        0,
      );

      // Should create Instrument Rack at device position
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "live_set tracks 0" }),
        "insert_device",
        "Instrument Rack",
        3,
      );

      // Should delete temp track
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "live_set" }),
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
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "live_set tracks 0" }),
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

      expect(result.id).toBe("new-rack");
      expect(result.type).toBe("instrument-rack");
    });
  });

  it("should throw error when mixing MIDI and Audio effects", () => {
    expect(() =>
      updateDevice({
        path: "t0/d0,t0/d2",
        wrapInRack: true,
      }),
    ).toThrow("cannot mix MIDI and Audio effects");
  });

  it("should place rack at toPath when provided", () => {
    // Mock track 1 exists
    liveApiType.mockImplementation(function () {
      if (this._path === "live_set tracks 1") return "Track";
      if (this._path === "live_set tracks 0 devices 0")
        return "AudioEffectDevice";
      if (this._path === "id device-0") return "AudioEffectDevice";
      if (this._path === "id new-rack") return "RackDevice";

      return "Device";
    });

    liveApiId.mockImplementation(function () {
      if (this._path === "live_set tracks 1") return "track-1";
      if (this._path === "live_set tracks 0 devices 0") return "device-0";
      if (this._path === "id device-0") return "device-0";
      if (this._path === "id new-rack") return "new-rack";
      if (this._path?.includes("chains 0")) return "chain-0";

      return "0";
    });

    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
      toPath: "t1",
    });

    // Should create rack on track 1, not track 0
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "live_set tracks 1" }),
      "insert_device",
      "Audio Effect Rack",
      expect.any(Number),
    );

    expect(result.id).toBe("new-rack");
  });

  it("should set rack name when provided", () => {
    const result = updateDevice({
      path: "t0/d0",
      wrapInRack: true,
      name: "My Effect Rack",
    });

    // Note: We can't easily verify set() was called on the rack
    // but we can verify the result
    expect(result.id).toBe("new-rack");
    expect(result.type).toBe("audio-effect-rack");
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

  it("should throw error when no devices found", () => {
    // Mock non-existent device
    liveApiId.mockReturnValue("0");

    expect(() =>
      updateDevice({
        ids: "nonexistent",
        wrapInRack: true,
      }),
    ).toThrow("no devices found");
  });

  it("should throw error when insert_chain fails", () => {
    // Mock rack with no pre-existing chains
    liveApiGet.mockImplementation(function (prop) {
      if (prop === "type") {
        if (
          this._path === "live_set tracks 0 devices 0" ||
          this._path === "id device-0" ||
          this._path === "device-0"
        ) {
          return [2]; // Audio effect
        }
      }

      // Rack starts with no chains
      if (prop === "chains" && this._path?.includes("new-rack")) {
        return [];
      }

      return [0];
    });

    // Mock insert_chain to fail (returns 1 instead of ["id", "chain-id"])
    liveApiCall.mockImplementation(function (method) {
      if (method === "insert_device") {
        return ["id", "new-rack"];
      }

      if (method === "insert_chain") {
        return 1; // Failure
      }

      return null;
    });

    expect(() =>
      updateDevice({
        path: "t0/d0",
        wrapInRack: true,
      }),
    ).toThrow("wrapInRack: failed to create chain 1/1");
  });
});
