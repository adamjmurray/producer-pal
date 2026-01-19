import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
} from "#src/test/mocks/mock-live-api.js";
import { createDevice } from "./create-device.js";

describe("createDevice", () => {
  beforeEach(() => {
    liveApiId.mockReturnValue("device123");
    liveApiPath.mockReturnValue("live_set tracks 0 devices 2");

    // Default: chains exist so auto-creation isn't triggered
    liveApiGet.mockImplementation(function (prop) {
      if (prop === "chains") return ["id", "chain-0"];
      if (prop === "can_have_drum_pads") return [0];

      return [];
    });

    liveApiCall.mockImplementation((method, _deviceName, _deviceIndex) => {
      if (method === "insert_device") {
        return ["id", "device123"];
      }

      return null;
    });
  });

  describe("device name validation", () => {
    it("should throw error for invalid device name", () => {
      expect(() =>
        createDevice({
          path: "t0",
          deviceName: "NotARealDevice",
        }),
      ).toThrow(/createDevice failed: invalid deviceName "NotARealDevice"/);
    });

    it("should include valid devices in error message", () => {
      expect(() =>
        createDevice({
          path: "t0",
          deviceName: "",
        }),
      ).toThrow(/Instruments:.*Wavetable/);
    });

    it("should include MIDI effects in error message", () => {
      expect(() =>
        createDevice({
          path: "t0",
          deviceName: "invalid",
        }),
      ).toThrow(/MIDI Effects:.*Arpeggiator/);
    });

    it("should include audio effects in error message", () => {
      expect(() =>
        createDevice({
          path: "t0",
          deviceName: "invalid",
        }),
      ).toThrow(/Audio Effects:.*Compressor/);
    });

    it("should accept all valid instruments", () => {
      const instruments = [
        "Analog",
        "Collision",
        "Drift",
        "Drum Rack",
        "DrumSampler",
        "Electric",
        "External Instrument",
        "Impulse",
        "Instrument Rack",
        "Meld",
        "Operator",
        "Sampler",
        "Simpler",
        "Tension",
        "Wavetable",
      ];

      for (const device of instruments) {
        expect(() =>
          createDevice({ path: "t0", deviceName: device }),
        ).not.toThrow();
      }
    });

    it("should accept all valid MIDI effects", () => {
      const midiEffects = [
        "Arpeggiator",
        "CC Control",
        "Chord",
        "MIDI Effect Rack",
        "Note Length",
        "Pitch",
        "Random",
        "Scale",
        "Velocity",
      ];

      for (const device of midiEffects) {
        expect(() =>
          createDevice({ path: "t0", deviceName: device }),
        ).not.toThrow();
      }
    });

    it("should accept all valid audio effects", () => {
      const audioEffects = [
        "Amp",
        "Audio Effect Rack",
        "Auto Filter",
        "Auto Pan-Tremolo",
        "Auto Shift",
        "Beat Repeat",
        "Cabinet",
        "Channel EQ",
        "Chorus-Ensemble",
        "Compressor",
        "Corpus",
        "Delay",
        "Drum Buss",
        "Dynamic Tube",
        "Echo",
        "EQ Eight",
        "EQ Three",
        "Erosion",
        "External Audio Effect",
        "Filter Delay",
        "Gate",
        "Glue Compressor",
        "Grain Delay",
        "Hybrid Reverb",
        "Limiter",
        "Looper",
        "Multiband Dynamics",
        "Overdrive",
        "Pedal",
        "Phaser-Flanger",
        "Redux",
        "Resonators",
        "Reverb",
        "Roar",
        "Saturator",
        "Shifter",
        "Spectral Resonator",
        "Spectral Time",
        "Spectrum",
        "Tuner",
        "Utility",
        "Vinyl Distortion",
        "Vocoder",
      ];

      for (const device of audioEffects) {
        expect(() =>
          createDevice({ path: "t0", deviceName: device }),
        ).not.toThrow();
      }
    });
  });

  describe("listing available devices", () => {
    it("should return valid devices list when deviceName is omitted", () => {
      const result = createDevice({});

      expect(result.instruments).toContain("Wavetable");
      expect(result.midiEffects).toContain("Arpeggiator");
      expect(result.audioEffects).toContain("Compressor");
    });

    it("should return valid devices list without path", () => {
      const result = createDevice({});

      expect(result).toHaveProperty("instruments");
      expect(result).toHaveProperty("midiEffects");
      expect(result).toHaveProperty("audioEffects");
      expect(Array.isArray(result.instruments)).toBe(true);
      expect(Array.isArray(result.midiEffects)).toBe(true);
      expect(Array.isArray(result.audioEffects)).toBe(true);
    });

    it("should not call Live API when listing devices", () => {
      createDevice({});

      expect(liveApiCall).not.toHaveBeenCalled();
    });
  });

  describe("path validation", () => {
    it("should throw error when deviceName provided but path missing", () => {
      expect(() => createDevice({ deviceName: "Compressor" })).toThrow(
        "createDevice failed: path is required when creating a device",
      );
    });
  });

  describe("path-based device creation", () => {
    describe("track paths", () => {
      it("should create device on track via path (append)", () => {
        liveApiPath.mockReturnValue("live_set tracks 0 devices 2");

        const result = createDevice({
          path: "t0",
          deviceName: "Compressor",
        });

        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ _path: "live_set tracks 0" }),
          "insert_device",
          "Compressor",
        );
        expect(result).toStrictEqual({
          deviceId: "device123",
          deviceIndex: 2,
        });
      });

      it("should create device on track via path with position", () => {
        liveApiPath.mockReturnValue("live_set tracks 0 devices 1");

        const result = createDevice({
          path: "t0/d1",
          deviceName: "EQ Eight",
        });

        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ _path: "live_set tracks 0" }),
          "insert_device",
          "EQ Eight",
          1,
        );
        expect(result).toStrictEqual({
          deviceId: "device123",
          deviceIndex: 1,
        });
      });

      it("should create device on return track via path", () => {
        liveApiPath.mockReturnValue("live_set return_tracks 0 devices 0");

        const result = createDevice({
          path: "rt0/d0",
          deviceName: "Reverb",
        });

        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ _path: "live_set return_tracks 0" }),
          "insert_device",
          "Reverb",
          0,
        );
        expect(result).toStrictEqual({
          deviceId: "device123",
          deviceIndex: 0,
        });
      });

      it("should create device on master track via path", () => {
        liveApiPath.mockReturnValue("live_set master_track devices 0");

        const result = createDevice({
          path: "mt",
          deviceName: "Limiter",
        });

        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ _path: "live_set master_track" }),
          "insert_device",
          "Limiter",
        );
        expect(result).toStrictEqual({
          deviceId: "device123",
          deviceIndex: 0,
        });
      });
    });

    describe("chain paths", () => {
      it("should create device in chain via path (append)", () => {
        const result = createDevice({
          path: "t0/d0/c0",
          deviceName: "Compressor",
        });

        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({
            _path: "live_set tracks 0 devices 0 chains 0",
          }),
          "insert_device",
          "Compressor",
        );
        expect(result.deviceId).toBe("device123");
      });

      it("should create device in chain via path with position", () => {
        liveApiPath.mockReturnValue(
          "live_set tracks 0 devices 0 chains 0 devices 0",
        );

        const result = createDevice({
          path: "t0/d0/c0/d0",
          deviceName: "EQ Eight",
        });

        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({
            _path: "live_set tracks 0 devices 0 chains 0",
          }),
          "insert_device",
          "EQ Eight",
          0,
        );
        expect(result).toStrictEqual({
          deviceId: "device123",
          deviceIndex: 0,
        });
      });

      it("should create device in return chain via path", () => {
        liveApiPath.mockReturnValue(
          "live_set tracks 0 devices 0 return_chains 0 devices 0",
        );

        const result = createDevice({
          path: "t0/d0/rc0/d0",
          deviceName: "Delay",
        });

        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({
            _path: "live_set tracks 0 devices 0 return_chains 0",
          }),
          "insert_device",
          "Delay",
          0,
        );
        expect(result).toStrictEqual({
          deviceId: "device123",
          deviceIndex: 0,
        });
      });
    });

    describe("error handling", () => {
      it("should throw error for non-existent container", () => {
        liveApiId.mockReturnValue("0");

        expect(() =>
          createDevice({
            path: "t99/d0/c0",
            deviceName: "Compressor",
          }),
        ).toThrow('Track in path "t99/d0/c0" does not exist');
      });

      it("should throw error when container exists() returns false", () => {
        // Mock track to return valid id but chain container to not exist
        const originalExists = global.LiveAPI.prototype.exists;

        global.LiveAPI.prototype.exists = vi.fn(function () {
          // Chains container doesn't exist
          return !this._path?.includes("chains");
        });

        expect(() =>
          createDevice({
            path: "t0/d0/c0",
            deviceName: "Compressor",
          }),
        ).toThrow(
          'createDevice failed: container at path "t0/d0/c0" does not exist',
        );

        global.LiveAPI.prototype.exists = originalExists;
      });

      it("should throw error when insert_device fails", () => {
        liveApiCall.mockReturnValue(["id", "0"]);
        liveApiId.mockImplementation(function () {
          return this._path.includes("id 0") ? "0" : "device123";
        });

        expect(() =>
          createDevice({
            path: "t0/d0/c0",
            deviceName: "Compressor",
          }),
        ).toThrow('could not insert "Compressor" at end in path "t0/d0/c0"');
      });

      it("should throw error with position when insert_device returns falsy deviceId", () => {
        // Return undefined as deviceId to trigger the null branch
        liveApiCall.mockReturnValue(["id", undefined]);

        expect(() =>
          createDevice({
            path: "t0/d1",
            deviceName: "EQ Eight",
          }),
        ).toThrow('could not insert "EQ Eight" at position 1 in path "t0/d1"');
      });
    });
  });
});
