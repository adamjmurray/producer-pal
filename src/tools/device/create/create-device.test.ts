// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupSelectMock } from "#src/test/focus-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { VALID_DEVICES } from "#src/tools/constants.ts";
import { createDevice } from "./create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
}));

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

function registerTrack1WithDevice456(): void {
  registerMockObject("track-1", {
    path: livePath.track(1),
    methods: { insert_device: () => ["id", "device456"] },
  });
  registerMockObject("device456", { path: livePath.track(1).device(0) });
}

/**
 * Re-register track 0 holding one existing device, so an insert at position 1
 * lands after it, plus the device that insert_device returns.
 * @returns The re-registered track 0 mock
 */
function registerTrack0WithExistingDevice(): RegisteredMockObject {
  const track = registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { devices: children("existing-device") },
    methods: { insert_device: () => ["id", "device123"] },
  });

  registerMockObject("device123", { path: livePath.track(0).device(1) });

  return track;
}

function registerTrack0WithDevice123(): void {
  registerMockObject("track-0", {
    path: livePath.track(0),
    methods: { insert_device: () => ["id", "device123"] },
  });
  registerMockObject("device123", { path: livePath.track(0).device(2) });
}

describe("createDevice", () => {
  let track0: RegisteredMockObject;
  let chain0: RegisteredMockObject;
  let createdDevice: RegisteredMockObject;

  beforeEach(() => {
    // No remote script answering, so only native names are valid.
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    track0 = registerMockObject("track-0", {
      path: livePath.track(0),
      methods: { insert_device: () => ["id", "device123"] },
    });

    createdDevice = registerMockObject("device123", {
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
    it("should throw error for invalid device name", async () => {
      await expect(
        createDevice({
          path: "t0",
          deviceName: "NotARealDevice",
        }),
      ).rejects.toThrow(/invalid deviceName "NotARealDevice"/);
    });

    it("should include valid devices in error message", async () => {
      await expect(
        createDevice({
          path: "t0",
          deviceName: "",
        }),
      ).rejects.toThrow(/Instruments:.*Wavetable/);
    });

    it("should include MIDI effects in error message", async () => {
      await expect(
        createDevice({
          path: "t0",
          deviceName: "invalid",
        }),
      ).rejects.toThrow(/MIDI Effects:.*Arpeggiator/);
    });

    it("should include audio effects in error message", async () => {
      await expect(
        createDevice({
          path: "t0",
          deviceName: "invalid",
        }),
      ).rejects.toThrow(/Audio Effects:.*Compressor/);
    });

    it("should accept all valid instruments", async () => {
      for (const device of VALID_DEVICES.instruments) {
        await expect(
          createDevice({ path: "t0", deviceName: device }),
        ).resolves.toBeDefined();
      }
    });

    it("should accept all valid MIDI effects", async () => {
      for (const device of VALID_DEVICES.midiEffects) {
        await expect(
          createDevice({ path: "t0", deviceName: device }),
        ).resolves.toBeDefined();
      }
    });

    it("should accept all valid audio effects", async () => {
      for (const device of VALID_DEVICES.audioEffects) {
        await expect(
          createDevice({ path: "t0", deviceName: device }),
        ).resolves.toBeDefined();
      }
    });
  });

  describe("listing available devices", () => {
    it("should return valid devices list when deviceName is omitted", async () => {
      const result = (await createDevice({})) as unknown as {
        instruments: string[];
        midiEffects: string[];
        audioEffects: string[];
      };

      expect(result.instruments).toContain("Wavetable");
      expect(result.midiEffects).toContain("Arpeggiator");
      expect(result.audioEffects).toContain("Compressor");
    });

    it("should return valid devices list without path", async () => {
      const result = (await createDevice({})) as unknown as {
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

    it.each([
      ["path", { path: "t0" }],
      ["name", { name: "Lead" }],
      ["params", { params: [{ name: "Dry/Wet", value: "50%" }] }],
    ])("refuses a list-mode call carrying %s", async (param, args) => {
      await expect(createDevice(args)).rejects.toThrow(
        `${param} requires deviceName; omit it to list available devices`,
      );
    });

    it("names every create-only arg it was sent", async () => {
      await expect(createDevice({ path: "t0", name: "Lead" })).rejects.toThrow(
        "path, name require deviceName; omit them to list available devices",
      );
    });

    it("does not touch Live before refusing", async () => {
      await expect(createDevice({ path: "t0" })).rejects.toThrow(
        "path requires deviceName",
      );

      expect(track0.call).not.toHaveBeenCalled();
    });

    it("should not call Live API when listing devices", async () => {
      await createDevice({});

      expect(track0.call).not.toHaveBeenCalled();
      expect(chain0.call).not.toHaveBeenCalled();
    });
  });

  describe("path validation", () => {
    it("should throw error when deviceName provided but path missing", async () => {
      await expect(createDevice({ deviceName: "Compressor" })).rejects.toThrow(
        "path is required when creating a device",
      );
    });
  });

  describe("path-based device creation", () => {
    describe("track paths", () => {
      it("should create device on track via path (append)", async () => {
        const result = await createDevice({
          path: "t0",
          deviceName: "Compressor",
        });

        expect(track0.call).toHaveBeenCalledWith("insert_device", "Compressor");
        // With no name given, the created device's name is left untouched.
        // (Checked via call args, not expect.anything(), which ignores an
        // undefined value the guard would otherwise write.)
        const nameSets = createdDevice.set.mock.calls.filter(
          (c: unknown[]) => c[0] === "name",
        );

        expect(nameSets).toHaveLength(0);
        expect(result).toStrictEqual({
          id: "device123",
          path: "t0/d2",
        });
      });

      it("should create device on track via path with position", async () => {
        track0 = registerTrack0WithExistingDevice();

        const result = await createDevice({
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
          path: "t0/d1",
        });
      });

      it("should create device on return track via path", async () => {
        const returnTrack = registerMockObject("rt-0", {
          path: livePath.returnTrack(0),
          properties: { devices: ["id", "existing-device"] },
          methods: { insert_device: () => ["id", "device123"] },
        });

        registerMockObject("device123", {
          path: livePath.returnTrack(0).device(0),
        });

        const result = await createDevice({
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
          path: "rt0/d0",
        });
      });

      it("should fallback to append when position is 0 on empty container", async () => {
        registerMockObject("device123", {
          path: livePath.track(0).device(0),
        });

        const result = await createDevice({
          path: "t0/d0",
          deviceName: "Compressor",
        });

        // Should call insert_device WITHOUT position (append mode)
        expect(track0.call).toHaveBeenCalledWith("insert_device", "Compressor");
        expect(result).toStrictEqual({
          id: "device123",
          path: "t0/d0",
        });
      });

      it("should warn and append when position is past the end of the chain", async () => {
        const mockConsole = await import("#src/shared/max/v8-max-console.ts");

        track0 = registerTrack0WithExistingDevice();

        const result = await createDevice({
          path: "t0/d5",
          deviceName: "Compressor",
        });

        expect(track0.call).toHaveBeenCalledWith("insert_device", "Compressor");
        expect(mockConsole.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            'path "t0/d5" is past the end of the device chain (1 device), appending "Compressor" instead',
          ),
        );
        expect(result).toStrictEqual({
          id: "device123",
          path: "t0/d1",
        });
      });

      it("counts the devices in the past-the-end warning in the plural", async () => {
        const mockConsole = await import("#src/shared/max/v8-max-console.ts");

        registerMockObject("track-0", {
          path: livePath.track(0),
          properties: { devices: children("device-a", "device-b") },
          methods: { insert_device: () => ["id", "device123"] },
        });
        registerMockObject("device123", { path: livePath.track(0).device(2) });

        await createDevice({ path: "t0/d5", deviceName: "Compressor" });

        expect(mockConsole.warn).toHaveBeenCalledWith(
          expect.stringContaining("(2 devices)"),
        );
      });

      it("should create device on master track via path", async () => {
        const masterTrack = registerMockObject("mt-0", {
          path: livePath.masterTrack(),
          methods: { insert_device: () => ["id", "device123"] },
        });

        registerMockObject("device123", {
          path: livePath.masterTrack().device(0),
        });

        const result = await createDevice({
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
          path: "mt/d0",
        });
      });
    });

    describe("chain paths", () => {
      it("should create device in chain via path (append)", async () => {
        const result = await createDevice({
          path: "t0/d0/c0",
          deviceName: "Compressor",
        });

        expect(chain0.call).toHaveBeenCalledWith("insert_device", "Compressor");
        expect(result).toStrictEqual({
          path: "t0/d2",
          id: "device123",
        });
      });

      it("should create device in chain via path with position", async () => {
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

        const result = await createDevice({
          path: "t0/d0/c0/d0",
          deviceName: "EQ Eight",
        });

        expect(chain.call).toHaveBeenCalledWith("insert_device", "EQ Eight", 0);
        expect(result).toStrictEqual({
          id: "device123",
          path: "t0/d0/c0/d0",
        });
      });

      it("should create device in return chain via path", async () => {
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

        const result = await createDevice({
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
          path: "t0/d0/rc0/d0",
        });
      });
    });

    describe("error handling", () => {
      it("should throw error for non-existent container", async () => {
        mockNonExistentObjects();

        await expect(
          createDevice({
            path: "t99/d0/c0",
            deviceName: "Compressor",
          }),
        ).rejects.toThrow('Track in path "t99/d0/c0" does not exist');
      });

      it("should throw error when container exists() returns false", async () => {
        const liveAPIGlobal = global as unknown as {
          LiveAPI: { prototype: { exists: () => boolean } };
        };
        const originalExists = liveAPIGlobal.LiveAPI.prototype.exists;

        liveAPIGlobal.LiveAPI.prototype.exists = vi.fn(
          function (this: { _path?: string }) {
            // Chains container doesn't exist
            return !this._path?.includes("chains");
          },
        );

        await expect(
          createDevice({
            path: "t0/d0/c0",
            deviceName: "Compressor",
          }),
        ).rejects.toThrow('container at path "t0/d0/c0" does not exist');

        liveAPIGlobal.LiveAPI.prototype.exists = originalExists;
      });

      it("should throw error when insert_device fails", async () => {
        registerMockObject("chain-0-handle", {
          path: livePath.track(0).device(0).chain(0),
          methods: { insert_device: () => ["id", "0"] },
        });

        await expect(
          createDevice({
            path: "t0/d0/c0",
            deviceName: "Compressor",
          }),
        ).rejects.toThrow(
          'could not insert "Compressor" at end in path "t0/d0/c0"',
        );
      });

      it("should throw error with position when insert_device returns falsy id", async () => {
        track0 = registerMockObject("track-0", {
          path: livePath.track(0),
          properties: { devices: children("existing-device") },
        });
        track0.call.mockImplementation((method: string) => {
          if (method === "insert_device") {
            return ["id", undefined];
          }

          return null;
        });

        await expect(
          createDevice({
            path: "t0/d1",
            deviceName: "EQ Eight",
          }),
        ).rejects.toThrow(
          'could not insert "EQ Eight" at position 1 in path "t0/d1"',
        );
      });
    });
  });

  describe("multi-path creation", () => {
    it("should create device at multiple paths", async () => {
      registerTrack1WithDevice456();

      const result = await createDevice({
        path: "t0,t1",
        deviceName: "Compressor",
      });

      expect(result).toStrictEqual([
        { id: "device123", path: "t0/d2" },
        { id: "device456", path: "t1/d0" },
      ]);
    });

    // "path is required" is false when a path was sent — it just named nothing,
    // which is a different mistake with a different fix.
    it("does not call a path that names nothing a missing path", async () => {
      await expect(
        createDevice({ path: ", ,", deviceName: "Compressor" }),
      ).rejects.toThrow('invalid path ", ," - it names nothing');
    });

    // name pairs with path by position, so dropping an empty path entry would
    // hand t1 the name t2 was meant to get. Nothing has been created yet, so
    // refusing costs the caller only a retry.
    it("refuses an empty path entry", async () => {
      registerTrack1WithDevice456();

      await expect(
        createDevice({
          path: "t0,,t1",
          deviceName: "Compressor",
          name: "A,B,C",
        }),
      ).rejects.toThrow('invalid path "t0,,t1" - it has an empty entry.');
    });

    // create-device used to warn and name what it could, where the update
    // tools threw for the same mistake.
    it("refuses a name list that doesn't match the paths", async () => {
      registerTrack1WithDevice456();

      await expect(
        createDevice({
          path: "t0,t1",
          deviceName: "Compressor",
          name: "A,B,C",
        }),
      ).rejects.toThrow("path names 2 entries but name names 3 entries");
    });

    it("refuses an empty entry in a name list", async () => {
      registerTrack1WithDevice456();

      await expect(
        createDevice({
          path: "t0,t1",
          deviceName: "Compressor",
          name: "A,",
        }),
      ).rejects.toThrow("path names 2 entries but name names 1 entry");
    });

    it("should return single result for single path (backward compatible)", async () => {
      const result = await createDevice({
        path: "t0",
        deviceName: "Compressor",
      });

      expect(result).toStrictEqual({
        id: "device123",
        path: "t0/d2",
      });
    });

    it("should set display name on created device", async () => {
      const device = registerMockObject("device123", {
        path: livePath.track(0).device(2),
      });

      const result = await createDevice({
        path: "t0",
        deviceName: "Compressor",
        name: "My Compressor",
      });

      expect(result).toStrictEqual({
        id: "device123",
        path: "t0/d2",
      });
      expect(device.set).toHaveBeenCalledWith("name", "My Compressor");
    });

    it("should warn and continue when one path fails", async () => {
      mockNonExistentObjects();
      registerTrack0WithDevice123();

      const mockConsole = await import("#src/shared/max/v8-max-console.ts");

      const result = await createDevice({
        path: "t0,t99",
        deviceName: "Compressor",
      });

      expect(result).toStrictEqual({
        id: "device123",
        path: "t0/d2",
      });
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to create"),
      );
    });

    it("should throw when all paths fail", async () => {
      mockNonExistentObjects();

      await expect(
        createDevice({ path: "t98,t99", deviceName: "Compressor" }),
      ).rejects.toThrow("could not create");
    });

    it("should re-throw when single path fails", async () => {
      mockNonExistentObjects();

      await expect(
        createDevice({ path: "t99", deviceName: "Compressor" }),
      ).rejects.toThrow('container at path "t99" does not exist');
    });
  });

  describe("focus functionality", () => {
    const selectMockRef = setupSelectMock();

    it("should select device and show device detail when focus=true", async () => {
      await createDevice({ deviceName: "EQ Eight", path: "t0", focus: true });

      expect(selectMockRef.get()).toHaveBeenCalledWith({
        id: "device123",
        detailView: "device",
      });
    });

    it("should not call select when focus=false", async () => {
      await createDevice({ deviceName: "EQ Eight", path: "t0", focus: false });

      expect(selectMockRef.get()).not.toHaveBeenCalled();
    });

    it("should focus last device when multi-path with focus=true", async () => {
      registerTrack1WithDevice456();

      await createDevice({
        deviceName: "Compressor",
        path: "t0,t1",
        focus: true,
      });

      expect(selectMockRef.get()).toHaveBeenCalledTimes(1);
      expect(selectMockRef.get()).toHaveBeenCalledWith({
        id: "device456",
        detailView: "device",
      });
    });

    it("should not call select in list mode", async () => {
      await createDevice({});

      expect(selectMockRef.get()).not.toHaveBeenCalled();
    });
  });
});
