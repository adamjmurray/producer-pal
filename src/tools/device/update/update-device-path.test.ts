// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import type { LiveObjectType } from "#src/types/live-object-types.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { updateDevice } from "./update-device.ts";

describe("updateDevice with path parameter", () => {
  it("should throw error when neither ids nor path is provided", () => {
    expect(() => updateDevice({})).toThrow(
      "Either ids or path must be provided",
    );
  });

  it("should throw error when both ids and path are provided", () => {
    expect(() => updateDevice({ ids: "123", path: "t1/d0" })).toThrow(
      "Provide either ids or path, not both",
    );
  });

  describe("device paths", () => {
    let device456: RegisteredMockObject;
    let view456: RegisteredMockObject;
    let returnDevice: RegisteredMockObject;
    let masterDevice: RegisteredMockObject;

    beforeEach(() => {
      device456 = registerMockObject("device-456", {
        path: livePath.track(1).device(0),
        type: "Device",
      });
      view456 = registerMockObject("view-456", {
        path: `${String(livePath.track(1).device(0))} view`,
      });
      returnDevice = registerMockObject("return-device-123", {
        path: livePath.returnTrack(0).device(0),
        type: "Device",
      });
      registerMockObject("view-return-123", {
        path: `${String(livePath.returnTrack(0).device(0))} view`,
      });
      masterDevice = registerMockObject("master-device-789", {
        path: livePath.masterTrack().device(0),
        type: "Device",
      });
      registerMockObject("view-master-789", {
        path: `${String(livePath.masterTrack().device(0))} view`,
      });
    });

    it("should update device by path on regular track", () => {
      const result = updateDevice({ path: "t1/d0", name: "My Device" });

      expect(device456.set).toHaveBeenCalledWith("name", "My Device");
      expect(result).toStrictEqual({ id: "device-456" });
    });

    it("should update device collapsed state by path", () => {
      const result = updateDevice({ path: "t1/d0", collapsed: true });

      expect(view456.set).toHaveBeenCalledWith("is_collapsed", 1);
      expect(result).toStrictEqual({ id: "device-456" });
    });

    it("should return empty array for non-existent device by path", () => {
      mockNonExistentObjects();

      const result = updateDevice({ path: "t5/d0", name: "Test" });

      expect(result).toStrictEqual([]);
    });

    it("should update device by path on return track", () => {
      const result = updateDevice({ path: "rt0/d0", name: "Return Device" });

      expect(returnDevice.set).toHaveBeenCalledWith("name", "Return Device");
      expect(result).toStrictEqual({ id: "return-device-123" });
    });

    it("should update device by path on master track", () => {
      const result = updateDevice({ path: "mt/d0", name: "Master Device" });

      expect(masterDevice.set).toHaveBeenCalledWith("name", "Master Device");
      expect(result).toStrictEqual({ id: "master-device-789" });
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
      expect(result).toStrictEqual({ id: "chain-123" });
    });

    it("should update chain mute state by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", mute: true });

      expect(chain123.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "chain-123" });
    });

    it("should update chain solo state by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", solo: true });

      expect(chain123.set).toHaveBeenCalledWith("solo", 1);
      expect(result).toStrictEqual({ id: "chain-123" });
    });

    it("should update chain color by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", color: "#FF0000" });

      expect(chain123.set).toHaveBeenCalledWith("color", 16711680);
      expect(result).toStrictEqual({ id: "chain-123" });
    });

    it("should return empty array for non-existent chain by path", () => {
      mockNonExistentObjects();

      const result = updateDevice({ path: "t5/d0/c0", name: "Test" });

      expect(result).toStrictEqual([]);
    });

    it("should update return chain by path", () => {
      const result = updateDevice({ path: "t1/d0/rc0", name: "Return Chain" });

      expect(returnChain456.set).toHaveBeenCalledWith("name", "Return Chain");
      expect(result).toStrictEqual({ id: "return-chain-456" });
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

      registerMockObject(deviceId, {
        path: livePath.track(1).device(0),
        type: "RackDevice",
        properties: {
          can_have_drum_pads: 1,
          chains: chainIds.flatMap((c) => ["id", c]),
        },
      });

      const chains = new Map<string, RegisteredMockObject>();

      for (const chainId of chainIds) {
        const chainProps = chainProperties[chainId] ?? {};

        chains.set(
          chainId,
          registerMockObject(chainId, {
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

      expect(chains.get("chain-36")?.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "chain-36" });
    });

    it("should update drum chain solo state by path (pNOTE)", () => {
      const { chains } = setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1", solo: true });

      expect(chains.get("chain-36")?.set).toHaveBeenCalledWith("solo", 1);
      expect(result).toStrictEqual({ id: "chain-36" });
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
      expect(result).toStrictEqual({ id: "chain-36" });
    });

    it("should update drum chain mute state by path (pNOTE/index)", () => {
      const { chains } = setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1/c0", mute: true });

      expect(chains.get("chain-36")?.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "chain-36" });
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
        "Either ids or path must be provided",
      );
    });

    it("should return empty array for track-only path (invalid)", () => {
      const result = updateDevice({ path: "t1", name: "Test" });

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

    it("should update multiple devices by comma-separated paths", () => {
      const result = updateDevice({
        path: "t0/d0, t0/d1, t1/d0",
        name: "Updated",
      });

      expect(device100.set).toHaveBeenCalledWith("name", "Updated");
      expect(device101.set).toHaveBeenCalledWith("name", "Updated");
      expect(device200.set).toHaveBeenCalledWith("name", "Updated");
      expect(result).toStrictEqual([
        { id: "device-100" },
        { id: "device-101" },
        { id: "device-200" },
      ]);
    });

    it("should skip non-existent paths and continue with valid ones", () => {
      const result = updateDevice({
        path: "t0/d0, t1/d1, t1/d0",
        name: "Updated",
      });

      expect(device100.set).toHaveBeenCalledWith("name", "Updated");
      expect(device200.set).toHaveBeenCalledWith("name", "Updated");
      expect(result).toStrictEqual([
        { id: "device-100" },
        { id: "device-200" },
      ]);
    });

    it("should return empty array when all paths are invalid", () => {
      const result = updateDevice({ path: "t5/d0, t6/d0", name: "Updated" });

      expect(result).toStrictEqual([]);
    });

    it("should return single object when only one path provided", () => {
      const result = updateDevice({ path: "t0/d0", name: "Single" });

      expect(result).toStrictEqual({ id: "device-100" });
    });

    it("should return single object when only one path valid out of many", () => {
      const result = updateDevice({
        path: "t0/d0, t5/d0, t6/d0",
        name: "Updated",
      });

      expect(result).toStrictEqual({ id: "device-100" });
    });

    it("should handle whitespace in comma-separated paths", () => {
      const result = updateDevice({
        path: "  t0/d0  ,  t1/d0  ",
        name: "Trimmed",
      });

      expect(device100.set).toHaveBeenCalledWith("name", "Trimmed");
      expect(device200.set).toHaveBeenCalledWith("name", "Trimmed");
      expect(result).toStrictEqual([
        { id: "device-100" },
        { id: "device-200" },
      ]);
    });

    it("should skip invalid path formats gracefully", () => {
      const result = updateDevice({
        path: "t0, t0/d0, t1/d0",
        name: "Updated",
      });

      // "t0" is invalid (no device index), but "t0/d0" and "t1/d0" should work
      expect(device100.set).toHaveBeenCalledWith("name", "Updated");
      expect(device200.set).toHaveBeenCalledWith("name", "Updated");
      expect(result).toStrictEqual([
        { id: "device-100" },
        { id: "device-200" },
      ]);
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
      expect(result).toStrictEqual([{ id: "device-100" }, { id: "chain-200" }]);
    });
  });

  describe("multiple paths with params", () => {
    let param100: RegisteredMockObject;
    let param200: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("device-100", {
        path: livePath.track(0).device(0),
        type: "Device",
      });
      param100 = registerMockObject("param-100-5", {
        path: livePath.track(0).device(0).parameter(5),
        properties: { is_quantized: 0 },
      });
      registerMockObject("device-200", {
        path: livePath.track(1).device(0),
        type: "Device",
      });
      param200 = registerMockObject("param-200-5", {
        path: livePath.track(1).device(0).parameter(5),
        properties: { is_quantized: 0 },
      });
    });

    it("should update params on multiple devices using path-based param IDs", () => {
      const result = updateDevice({
        path: "t0/d0, t1/d0",
        params: `{"${livePath.track(0).device(0).parameter(5)}": 1000}`,
      });

      expect(param100.set).toHaveBeenCalledWith("display_value", 1000);
      expect(param200.set).toHaveBeenCalledWith("display_value", 1000);
      expect(result).toStrictEqual([
        { id: "device-100" },
        { id: "device-200" },
      ]);
    });
  });
});
