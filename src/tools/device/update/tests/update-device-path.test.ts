// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { updateDevice } from "../update-device.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateDevice with path parameter", () => {
  it("should throw error when neither id nor path is provided", () => {
    expect(() => updateDevice({})).toThrow("id or path is required");
  });

  // Both spellings are published, so a model picking one nulls the other.
  // z.coerce.string() renders that as "null" — counting it as sent refused the
  // update over a param the caller deliberately left empty.
  it("updates by path when id is a coerced null", () => {
    const warn = vi.spyOn(console, "warn");
    const device = registerMockObject("device-456", {
      path: livePath.track(1).device(0),
      type: "Device",
    });

    updateDevice({ id: "null", path: "t1/d0", name: "Renamed" });

    expect(device.set).toHaveBeenCalledWith("name", "Renamed");
    expect(warn).toHaveBeenCalledWith('id "null" names nothing');
  });

  // id and path name different devices, so they add up, as on every other
  // multi-target tool. Naming both used to refuse the call outright.
  it("updates the devices named by id and by path together", () => {
    const byId = registerMockObject("device-456", {
      path: livePath.track(1).device(0),
      type: "Device",
    });
    const byPath = registerMockObject("device-789", {
      path: livePath.track(2).device(0),
      type: "Device",
    });

    const result = updateDevice({
      id: "device-456",
      path: "t2/d0",
      name: "A,B",
    });

    expect(byId.set).toHaveBeenCalledWith("name", "A");
    expect(byPath.set).toHaveBeenCalledWith("name", "B");
    expect(result).toStrictEqual([
      { id: "device-456", path: "t1/d0" },
      { id: "device-789", path: "t2/d0" },
    ]);
  });

  // The combined count is what a value list pairs against.
  it("counts id and path together when pairing names", () => {
    registerMockObject("device-456", {
      path: livePath.track(1).device(0),
      type: "Device",
    });
    registerMockObject("device-789", {
      path: livePath.track(2).device(0),
      type: "Device",
    });

    expect(() =>
      updateDevice({ id: "device-456", path: "t2/d0", name: "A,B,C" }),
    ).toThrow("id and path names 2 entries but name names 3 entries.");
  });

  // A permanent alias, not a migration: models reach for the plural on their
  // own, so it keeps working.
  it("still updates by the ids alias", () => {
    const device = registerMockObject("device-456", {
      path: livePath.track(1).device(0),
      type: "Device",
    });

    updateDevice({ ids: "device-456", name: "Renamed" });

    expect(device.set).toHaveBeenCalledWith("name", "Renamed");
  });

  // `path` takes a list too, so the plural is the same guess `ids` is.
  it("still updates by the paths alias", () => {
    const device = registerMockObject("device-456", {
      path: livePath.track(1).device(0),
      type: "Device",
    });

    updateDevice({ paths: "t1/d0", name: "Renamed" });

    expect(device.set).toHaveBeenCalledWith("name", "Renamed");
  });

  describe("device paths", () => {
    let device456: RegisteredMockObject;
    let returnDevice: RegisteredMockObject;
    let masterDevice: RegisteredMockObject;

    beforeEach(() => {
      device456 = registerMockObject("device-456", {
        path: livePath.track(1).device(0),
        type: "Device",
      });
      registerMockObject("view-456", {
        path: `${livePath.track(1).device(0)} view`,
      });
      returnDevice = registerMockObject("return-device-123", {
        path: livePath.returnTrack(0).device(0),
        type: "Device",
      });
      registerMockObject("view-return-123", {
        path: `${livePath.returnTrack(0).device(0)} view`,
      });
      masterDevice = registerMockObject("master-device-789", {
        path: livePath.masterTrack().device(0),
        type: "Device",
      });
      registerMockObject("view-master-789", {
        path: `${livePath.masterTrack().device(0)} view`,
      });
    });

    it("should update device by path on regular track", () => {
      const result = updateDevice({ path: "t1/d0", name: "My Device" });

      expect(device456.set).toHaveBeenCalledWith("name", "My Device");
      expect(result).toStrictEqual({ id: "device-456", path: "t1/d0" });
    });

    // collapsed — kept for potential future use (test removed)

    it("should return empty array for non-existent device by path", () => {
      mockNonExistentObjects();

      const result = updateDevice({ path: "t5/d0", name: "Test" });

      expect(result).toStrictEqual([]);
    });

    it("should update device by path on return track", () => {
      const result = updateDevice({ path: "rt0/d0", name: "Return Device" });

      expect(returnDevice.set).toHaveBeenCalledWith("name", "Return Device");
      expect(result).toStrictEqual({ id: "return-device-123", path: "rt0/d0" });
    });

    it("should update device by path on master track", () => {
      const result = updateDevice({ path: "mt/d0", name: "Master Device" });

      expect(masterDevice.set).toHaveBeenCalledWith("name", "Master Device");
      expect(result).toStrictEqual({ id: "master-device-789", path: "mt/d0" });
    });
  });

  describe("chain paths", () => {
    let chain123: RegisteredMockObject;
    let returnChain456: RegisteredMockObject;

    beforeEach(() => {
      chain123 = registerMockObject("chain-123", {
        path: livePath.track(1).device(0).chain(0),
        type: "Chain",
      });
      returnChain456 = registerMockObject("return-chain-456", {
        path: livePath.track(1).device(0).returnChain(0),
        type: "Chain",
      });
    });

    it("should update chain by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", name: "My Chain" });

      expect(chain123.set).toHaveBeenCalledWith("name", "My Chain");
      expect(result).toStrictEqual({ id: "chain-123", path: "t1/d0/c0" });
    });

    it("should update chain mute state by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", mute: true });

      expect(chain123.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "chain-123", path: "t1/d0/c0" });
    });

    it("should update chain solo state by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", solo: true });

      expect(chain123.set).toHaveBeenCalledWith("solo", 1);
      expect(result).toStrictEqual({ id: "chain-123", path: "t1/d0/c0" });
    });

    it("should update chain color by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", color: "#FF0000" });

      expect(chain123.set).toHaveBeenCalledWith("color", 16711680);
      expect(result).toStrictEqual({ id: "chain-123", path: "t1/d0/c0" });
    });

    it("should return empty array for non-existent chain by path", () => {
      mockNonExistentObjects();

      const result = updateDevice({ path: "t5/d0/c0", name: "Test" });

      expect(result).toStrictEqual([]);
    });

    it("should update return chain by path", () => {
      const result = updateDevice({ path: "t1/d0/rc0", name: "Return Chain" });

      expect(returnChain456.set).toHaveBeenCalledWith("name", "Return Chain");
      expect(result).toStrictEqual({
        id: "return-chain-456",
        path: "t1/d0/rc0",
      });
    });

    it("should drop the send letter when renaming a return chain", () => {
      // Live re-adds the letter itself. read-device reports the prefixed name,
      // so writing it back unchanged would store "A A Reverb".
      updateDevice({ path: "t1/d0/rc0", name: "A Reverb" });

      expect(returnChain456.set).toHaveBeenCalledWith("name", "Reverb");
    });

    it("should drop a lower-case send letter too", () => {
      updateDevice({ path: "t1/d0/rc0", name: "a Reverb" });

      expect(returnChain456.set).toHaveBeenCalledWith("name", "Reverb");
    });

    it("should keep a letter that is not the chain's own", () => {
      // Only the chain's own letter is Live's doing; "B" here is the user's.
      updateDevice({ path: "t1/d0/rc0", name: "B Reverb" });

      expect(returnChain456.set).toHaveBeenCalledWith("name", "B Reverb");
    });

    it("should keep a leading letter on a regular chain", () => {
      // Live only prefixes return chains, so a normal chain keeps the name.
      updateDevice({ path: "t1/d0/c0", name: "A Reverb" });

      expect(chain123.set).toHaveBeenCalledWith("name", "A Reverb");
    });
  });

  describe("drum pad paths", () => {
    interface ChainProps {
      inNote?: number;
      name?: string;
      mute?: number;
      solo?: number;
      deviceIds?: string[];
      type?: LiveObjectType;
    }
    interface DeviceProps {
      name?: string;
    }
    interface DrumPadMockConfig {
      deviceId?: string;
      chainIds?: string[];
      chainProperties?: Record<string, ChainProps>;
      deviceProperties?: Record<string, DeviceProps>;
    }
    interface DrumPadMockResult {
      chains: Map<string, RegisteredMockObject>;
      devices: Map<string, RegisteredMockObject>;
    }

    const setupDrumPadMocks = (
      config: DrumPadMockConfig,
    ): DrumPadMockResult => {
      const {
        deviceId = "drum-rack-1",
        chainIds = ["chain-36"],
        chainProperties = {},
        deviceProperties = {},
      } = config;

      // One DrumPad per note the chains land on, the way a real rack has them.
      const padNotes = [
        ...new Set(chainIds.map((c) => chainProperties[c]?.inNote ?? 36)),
      ];

      registerMockObject(deviceId, {
        path: livePath.track(1).device(0),
        type: "RackDevice",
        properties: {
          can_have_drum_pads: 1,
          chains: chainIds.flatMap((c) => ["id", c]),
          drum_pads: padNotes.flatMap((n) => ["id", `pad-${n}`]),
        },
      });

      for (const note of padNotes) {
        registerMockObject(`pad-${note}`, {
          type: "DrumPad",
          properties: { note },
        });
      }

      const chains = new Map<string, RegisteredMockObject>();

      for (const [chainIndex, chainId] of chainIds.entries()) {
        const chainProps = chainProperties[chainId] ?? {};

        chains.set(
          chainId,
          registerMockObject(chainId, {
            // Drum chains live in the rack's own `chains` list, not under
            // `drum_pads`.
            path: `${livePath.track(1).device(0)} chains ${chainIndex}`,
            type: chainProps.type ?? "DrumChain",
            properties: {
              in_note: chainProps.inNote ?? 36,
              name: chainProps.name ?? "Chain",
              mute: chainProps.mute ?? 0,
              solo: chainProps.solo ?? 0,
              devices: (chainProps.deviceIds ?? []).flatMap((d) => ["id", d]),
            },
          }),
        );
      }

      const devices = new Map<string, RegisteredMockObject>();

      for (const [devId, devProps] of Object.entries(deviceProperties)) {
        devices.set(
          devId,
          registerMockObject(devId, {
            type: "Device",
            properties: { name: devProps.name ?? "Device" },
          }),
        );
      }

      return { chains, devices };
    };

    it("should update drum chain mute state by path (pNOTE)", () => {
      const { chains } = setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1", mute: true });

      // A bare pad path writes mute to the DrumPad; Live broadcasts from there.
      expect(chains.get("chain-36")?.set).not.toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "pad-36" });
    });

    it("should update drum chain solo state by path (pNOTE)", () => {
      const { chains } = setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1", solo: true });

      expect(chains.get("chain-36")?.set).not.toHaveBeenCalledWith("solo", 1);
      expect(result).toStrictEqual({ id: "pad-36" });
    });

    it("should return empty array for non-existent drum chain by path", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC3", mute: true });

      expect(result).toStrictEqual([]);
    });

    it("should update drum chain by path (pNOTE/index)", () => {
      const { chains } = setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1/c0", name: "New Layer" });

      expect(chains.get("chain-36")?.set).toHaveBeenCalledWith(
        "name",
        "New Layer",
      );
      expect(result).toStrictEqual({ id: "chain-36", path: "t1/d0/pC1/c0" });
    });

    it("should update drum chain mute state by path (pNOTE/index)", () => {
      const { chains } = setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1/c0", mute: true });

      expect(chains.get("chain-36")?.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "chain-36", path: "t1/d0/pC1/c0" });
    });

    it("should return empty array for invalid chain index", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1/c5", name: "Test" });

      expect(result).toStrictEqual([]);
    });

    it("should update device inside drum chain by path", () => {
      const { devices } = setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: {
          "chain-36": { inNote: 36, name: "Kick", deviceIds: ["device-1"] },
        },
        deviceProperties: { "device-1": { name: "Simpler" } },
      });

      const result = updateDevice({
        path: "t1/d0/pC1/c0/d0",
        name: "New Simpler",
      });

      expect(devices.get("device-1")?.set).toHaveBeenCalledWith(
        "name",
        "New Simpler",
      );
      expect(result).toStrictEqual({ id: "device-1" });
    });

    it("should return empty array for invalid device index in drum chain", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: {
          "chain-36": { inNote: 36, name: "Kick", deviceIds: [] },
        },
      });

      const result = updateDevice({ path: "t1/d0/pC1/c0/d5", name: "Test" });

      expect(result).toStrictEqual([]);
    });
  });

  describe("path validation", () => {
    it("should throw error for empty path (treated as no path)", () => {
      expect(() => updateDevice({ path: "", name: "Test" })).toThrow(
        "id or path is required",
      );
    });

    it("should return empty array for track-only path (invalid)", () => {
      const result = updateDevice({ path: "t1", name: "Test" });

      expect(result).toStrictEqual([]);
    });

    it("should warn and skip a malformed path that fails to resolve", () => {
      // "zzz" is not a valid path segment, so resolvePathToLiveApi throws; the
      // safe resolver catches it, warns, and drops the item instead of aborting.
      const result = updateDevice({ path: "zzz", name: "Test" });

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining('invalid path "zzz"'),
      );
      expect(result).toStrictEqual([]);
    });
  });

  describe("multiple comma-separated paths", () => {
    let device100: RegisteredMockObject;
    let device101: RegisteredMockObject;
    let device200: RegisteredMockObject;

    beforeEach(() => {
      device100 = registerMockObject("device-100", {
        path: livePath.track(0).device(0),
        type: "Device",
      });
      device101 = registerMockObject("device-101", {
        path: livePath.track(0).device(1),
        type: "Device",
      });
      device200 = registerMockObject("device-200", {
        path: livePath.track(1).device(0),
        type: "Device",
      });
      // t1/d1 is non-existent — not registered
      mockNonExistentObjects();
    });

    // t0/d0 and t1/d0 were both renamed, and they are the only two reported.
    function expectBothDevicesRenamed(result: unknown, name: string): void {
      expect(device100.set).toHaveBeenCalledWith("name", name);
      expect(device200.set).toHaveBeenCalledWith("name", name);
      expect(result).toStrictEqual([
        { id: "device-100", path: "t0/d0" },
        { id: "device-200", path: "t1/d0" },
      ]);
    }

    it("should update multiple devices by comma-separated paths", () => {
      const result = updateDevice({
        path: "t0/d0, t0/d1, t1/d0",
        name: "Updated",
      });

      expect(device100.set).toHaveBeenCalledWith("name", "Updated");
      expect(device101.set).toHaveBeenCalledWith("name", "Updated");
      expect(device200.set).toHaveBeenCalledWith("name", "Updated");
      expect(result).toStrictEqual([
        { id: "device-100", path: "t0/d0" },
        { id: "device-101", path: "t0/d1" },
        { id: "device-200", path: "t1/d0" },
      ]);
    });

    it("should skip non-existent paths and continue with valid ones", () => {
      const result = updateDevice({
        path: "t0/d0, t1/d1, t1/d0",
        name: "Updated",
      });

      expectBothDevicesRenamed(result, "Updated");
    });

    it("should return empty array when all paths are invalid", () => {
      const result = updateDevice({ path: "t5/d0, t6/d0", name: "Updated" });

      expect(result).toStrictEqual([]);
    });

    it("should return single object when only one path provided", () => {
      const result = updateDevice({ path: "t0/d0", name: "Single" });

      expect(result).toStrictEqual({ id: "device-100", path: "t0/d0" });
    });

    it("should return single object when only one path valid out of many", () => {
      const result = updateDevice({
        path: "t0/d0, t5/d0, t6/d0",
        name: "Updated",
      });

      expect(result).toStrictEqual({ id: "device-100", path: "t0/d0" });
    });

    it("should handle whitespace in comma-separated paths", () => {
      const result = updateDevice({
        path: "  t0/d0  ,  t1/d0  ",
        name: "Trimmed",
      });

      expectBothDevicesRenamed(result, "Trimmed");
    });

    it("should skip invalid path formats gracefully", () => {
      const result = updateDevice({
        path: "t0, t0/d0, t1/d0",
        name: "Updated",
      });

      // "t0" is invalid (no device index), but "t0/d0" and "t1/d0" should work
      expectBothDevicesRenamed(result, "Updated");
    });
  });

  describe("multiple paths with mixed types", () => {
    it("should update mixed device and chain types", () => {
      const device100 = registerMockObject("device-100", {
        path: livePath.track(0).device(0),
        type: "Device",
      });
      const chain200 = registerMockObject("chain-200", {
        path: livePath.track(1).device(0).chain(0),
        type: "Chain",
      });

      const result = updateDevice({ path: "t0/d0, t1/d0/c0", name: "Mixed" });

      expect(device100.set).toHaveBeenCalledWith("name", "Mixed");
      expect(chain200.set).toHaveBeenCalledWith("name", "Mixed");
      expect(result).toStrictEqual([
        { id: "device-100", path: "t0/d0" },
        { id: "chain-200", path: "t1/d0/c0" },
      ]);
    });
  });

  describe("multiple paths with params", () => {
    let param100: RegisteredMockObject;
    let param200: RegisteredMockObject;

    const freqParamProps = {
      properties: {
        is_quantized: 0,
        name: "Filter Freq",
        original_name: "Filter Freq",
        value: 500,
        min: 20,
        max: 20000,
      },
      methods: { str_for_value: (v: unknown) => `${String(v)} Hz` },
    };

    beforeEach(() => {
      registerMockObject("device-100", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("param-100-5") },
      });
      param100 = registerMockObject("param-100-5", {
        path: livePath.track(0).device(0).parameter(5),
        ...freqParamProps,
      });
      registerMockObject("device-200", {
        path: livePath.track(1).device(0),
        type: "Device",
        properties: { parameters: children("param-200-5") },
      });
      param200 = registerMockObject("param-200-5", {
        path: livePath.track(1).device(0).parameter(5),
        ...freqParamProps,
      });
    });

    it("should update params on multiple devices using param names", () => {
      const result = updateDevice({
        path: "t0/d0, t1/d0",
        params: [{ name: "Filter Freq", value: "1000" }],
      });

      expect(param100.set).toHaveBeenCalledWith("value", 1000);
      expect(param200.set).toHaveBeenCalledWith("value", 1000);
      expect(result).toStrictEqual([
        {
          id: "device-100",
          path: "t0/d0",
          params: [{ id: "param-100-5", name: "Filter Freq", value: 1000 }],
        },
        {
          id: "device-200",
          path: "t1/d0",
          params: [{ id: "param-200-5", name: "Filter Freq", value: 1000 }],
        },
      ]);
    });
  });
});
