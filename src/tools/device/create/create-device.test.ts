// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "./create-device.ts";

describe("createDevice", () => {
  let track0: RegisteredMockObject;
  let chain0: RegisteredMockObject;

  beforeEach(() => {
    track0 = registerMockObject("track-0", {
      path: livePath.track(0),
      methods: { insert_device: () => ["id", "device123"] },
    });

    registerMockObject("device123", {
      path: livePath.track(0).device(2),
    });

    // Default rack for chain path resolution
    registerMockObject("rack-0", {
      path: livePath.track(0).device(0),
      properties: { chains: children("chain-0"), can_have_drum_pads: 0 },
    });

    chain0 = registerMockObject("chain-0-handle", {
      path: livePath.track(0).device(0).chain(0),
      methods: { insert_device: () => ["id", "device123"] },
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
      const result = createDevice({}) as unknown as {
        instruments: string[];
        midiEffects: string[];
        audioEffects: string[];
      };

      expect(result.instruments).toContain("Wavetable");
      expect(result.midiEffects).toContain("Arpeggiator");
      expect(result.audioEffects).toContain("Compressor");
    });

    it("should return valid devices list without path", () => {
      const result = createDevice({}) as unknown as {
        instruments: string[];
        midiEffects: string[];
        audioEffects: string[];
      };

      expect(result).toHaveProperty("instruments");
      expect(result).toHaveProperty("midiEffects");
      expect(result).toHaveProperty("audioEffects");
      expect(Array.isArray(result.instruments)).toBe(true);
      expect(Array.isArray(result.midiEffects)).toBe(true);
      expect(Array.isArray(result.audioEffects)).toBe(true);
    });

    it("should not call Live API when listing devices", () => {
      createDevice({});

      expect(track0.call).not.toHaveBeenCalled();
      expect(chain0.call).not.toHaveBeenCalled();
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
        const result = createDevice({
          path: "t0",
          deviceName: "Compressor",
        });

        expect(track0.call).toHaveBeenCalledWith("insert_device", "Compressor");
        expect(result).toStrictEqual({
          id: "device123",
          deviceIndex: 2,
        });
      });

      it("should create device on track via path with position", () => {
        registerMockObject("device123", {
          path: livePath.track(0).device(1),
        });

        const result = createDevice({
          path: "t0/d1",
          deviceName: "EQ Eight",
        });

        expect(track0.call).toHaveBeenCalledWith(
          "insert_device",
          "EQ Eight",
          1,
        );
        expect(result).toStrictEqual({
          id: "device123",
          deviceIndex: 1,
        });
      });

      it("should create device on return track via path", () => {
        const returnTrack = registerMockObject("rt-0", {
          path: livePath.returnTrack(0),
          properties: { devices: ["id", "existing-device"] },
          methods: { insert_device: () => ["id", "device123"] },
        });

        registerMockObject("device123", {
          path: livePath.returnTrack(0).device(0),
        });

        const result = createDevice({
          path: "rt0/d0",
          deviceName: "Reverb",
        });

        expect(returnTrack.call).toHaveBeenCalledWith(
          "insert_device",
          "Reverb",
          0,
        );
        expect(result).toStrictEqual({
          id: "device123",
          deviceIndex: 0,
        });
      });

      it("should fallback to append when position is 0 on empty container", () => {
        registerMockObject("device123", {
          path: livePath.track(0).device(0),
        });

        const result = createDevice({
          path: "t0/d0",
          deviceName: "Compressor",
        });

        // Should call insert_device WITHOUT position (append mode)
        expect(track0.call).toHaveBeenCalledWith("insert_device", "Compressor");
        expect(result).toStrictEqual({
          id: "device123",
          deviceIndex: 0,
        });
      });

      it("should create device on master track via path", () => {
        const masterTrack = registerMockObject("mt-0", {
          path: livePath.masterTrack(),
          methods: { insert_device: () => ["id", "device123"] },
        });

        registerMockObject("device123", {
          path: livePath.masterTrack().device(0),
        });

        const result = createDevice({
          path: "mt",
          deviceName: "Limiter",
        });

        expect(masterTrack.call).toHaveBeenCalledWith(
          "insert_device",
          "Limiter",
        );
        expect(track0.call).not.toHaveBeenCalled();
        expect(result).toStrictEqual({
          id: "device123",
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

        expect(chain0.call).toHaveBeenCalledWith("insert_device", "Compressor");
        expect(result).toMatchObject({ id: "device123" });
      });

      it("should create device in chain via path with position", () => {
        registerMockObject("rack-0", {
          path: livePath.track(0).device(0),
          properties: {
            chains: children("chain-0"),
            can_have_drum_pads: 0,
            devices: ["id", "existing-device"],
          },
        });
        const chain = registerMockObject("chain-0-handle", {
          path: livePath.track(0).device(0).chain(0),
          properties: { devices: ["id", "existing-device"] },
          methods: { insert_device: () => ["id", "device123"] },
        });

        registerMockObject("device123", {
          path: livePath.track(0).device(0).chain(0).device(0),
        });

        const result = createDevice({
          path: "t0/d0/c0/d0",
          deviceName: "EQ Eight",
        });

        expect(chain.call).toHaveBeenCalledWith("insert_device", "EQ Eight", 0);
        expect(result).toStrictEqual({
          id: "device123",
          deviceIndex: 0,
        });
      });

      it("should create device in return chain via path", () => {
        registerMockObject("rack-0", {
          path: livePath.track(0).device(0),
          properties: {
            chains: children("chain-0"),
            return_chains: children("rchain-0"),
            can_have_drum_pads: 0,
          },
        });
        const returnChain = registerMockObject("rchain-0-handle", {
          path: livePath.track(0).device(0).returnChain(0),
          properties: { devices: ["id", "existing-device"] },
          methods: { insert_device: () => ["id", "device123"] },
        });

        registerMockObject("device123", {
          path: livePath.track(0).device(0).returnChain(0).device(0),
        });

        const result = createDevice({
          path: "t0/d0/rc0/d0",
          deviceName: "Delay",
        });

        expect(returnChain.call).toHaveBeenCalledWith(
          "insert_device",
          "Delay",
          0,
        );
        expect(result).toStrictEqual({
          id: "device123",
          deviceIndex: 0,
        });
      });
    });

    describe("error handling", () => {
      it("should throw error for non-existent container", () => {
        mockNonExistentObjects();

        expect(() =>
          createDevice({
            path: "t99/d0/c0",
            deviceName: "Compressor",
          }),
        ).toThrow('Track in path "t99/d0/c0" does not exist');
      });

      it("should throw error when container exists() returns false", () => {
        const liveAPIGlobal = global as unknown as {
          LiveAPI: { prototype: { exists: () => boolean } };
        };
        const originalExists = liveAPIGlobal.LiveAPI.prototype.exists;

        liveAPIGlobal.LiveAPI.prototype.exists = vi.fn(function (this: {
          _path?: string;
        }) {
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

        liveAPIGlobal.LiveAPI.prototype.exists = originalExists;
      });

      it("should throw error when insert_device fails", () => {
        registerMockObject("chain-0-handle", {
          path: livePath.track(0).device(0).chain(0),
          methods: { insert_device: () => ["id", "0"] },
        });

        expect(() =>
          createDevice({
            path: "t0/d0/c0",
            deviceName: "Compressor",
          }),
        ).toThrow('could not insert "Compressor" at end in path "t0/d0/c0"');
      });

      it("should throw error with position when insert_device returns falsy id", () => {
        track0.call.mockImplementation((method: string) => {
          if (method === "insert_device") return ["id", undefined];

          return null;
        });

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
