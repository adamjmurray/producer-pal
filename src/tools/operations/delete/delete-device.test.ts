// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  setupDeviceMocks,
  setupDrumChainMocks,
  setupDrumPadMocks,
} from "./delete-test-helpers.ts";
import { deleteObject } from "./delete.ts";

describe("deleteObject device deletion", () => {
  it("should delete a device from a regular track", () => {
    const id = "device_1";
    const path = String(livePath.track(0).device(1));

    const { parents } = setupDeviceMocks(id, path);

    const result = deleteObject({ ids: id, type: "device" });

    expect(result).toStrictEqual({ id, type: "device", deleted: true });
    expect(parents.get(String(livePath.track(0)))?.call).toHaveBeenCalledWith(
      "delete_device",
      1,
    );
  });

  it("should delete a device from a return track", () => {
    const id = "device_2";
    const path = String(livePath.returnTrack(0).device(1));

    const { parents } = setupDeviceMocks(id, path);

    const result = deleteObject({ ids: id, type: "device" });

    expect(result).toStrictEqual({ id, type: "device", deleted: true });
    expect(
      parents.get(String(livePath.returnTrack(0)))?.call,
    ).toHaveBeenCalledWith("delete_device", 1);
  });

  it("should delete a device from the master track", () => {
    const id = "device_3";
    const path = String(livePath.masterTrack().device(0));

    const { parents } = setupDeviceMocks(id, path);

    const result = deleteObject({ ids: id, type: "device" });

    expect(result).toStrictEqual({ id, type: "device", deleted: true });
    expect(
      parents.get(String(livePath.masterTrack()))?.call,
    ).toHaveBeenCalledWith("delete_device", 0);
  });

  it("should delete multiple devices", () => {
    const ids = "device_1,device_2";

    const { parents } = setupDeviceMocks(["device_1", "device_2"], {
      device_1: String(livePath.track(0).device(0)),
      device_2: String(livePath.track(1).device(1)),
    });

    const result = deleteObject({ ids, type: "device" });

    expect(result).toStrictEqual([
      { id: "device_1", type: "device", deleted: true },
      { id: "device_2", type: "device", deleted: true },
    ]);
    expect(parents.get(String(livePath.track(0)))?.call).toHaveBeenCalledWith(
      "delete_device",
      0,
    );
    expect(parents.get(String(livePath.track(1)))?.call).toHaveBeenCalledWith(
      "delete_device",
      1,
    );
  });

  it("should throw error when device path is malformed", () => {
    const id = "device_0";

    setupDeviceMocks(id, "invalid_path_without_devices");

    expect(() => deleteObject({ ids: id, type: "device" })).toThrow(
      'delete failed: could not find device index in path "invalid_path_without_devices"',
    );
  });

  describe("nested device deletion", () => {
    it("should delete a device nested in a chain", () => {
      const id = "nested_device";
      const path = "live_set tracks 1 devices 0 chains 2 devices 1";

      const { parents } = setupDeviceMocks(id, path);

      const result = deleteObject({ ids: id, type: "device" });

      expect(result).toStrictEqual({ id, type: "device", deleted: true });
      // Should call delete_device on the chain, not the track
      expect(
        parents.get("live_set tracks 1 devices 0 chains 2")?.call,
      ).toHaveBeenCalledWith("delete_device", 1);
    });

    it("should delete a device nested in a return chain", () => {
      const id = "return_chain_device";
      const path = "live_set tracks 0 devices 0 return_chains 1 devices 0";

      const { parents } = setupDeviceMocks(id, path);

      const result = deleteObject({ ids: id, type: "device" });

      expect(result).toStrictEqual({ id, type: "device", deleted: true });
      expect(
        parents.get("live_set tracks 0 devices 0 return_chains 1")?.call,
      ).toHaveBeenCalledWith("delete_device", 0);
    });

    it("should delete a deeply nested device", () => {
      const id = "deep_device";
      // Device inside chain inside chain (rack in a rack)
      const path =
        "live_set tracks 0 devices 0 chains 0 devices 1 chains 0 devices 2";

      const { parents } = setupDeviceMocks(id, path);

      const result = deleteObject({ ids: id, type: "device" });

      expect(result).toStrictEqual({ id, type: "device", deleted: true });
      // Should call delete_device on the innermost chain
      expect(
        parents.get("live_set tracks 0 devices 0 chains 0 devices 1 chains 0")
          ?.call,
      ).toHaveBeenCalledWith("delete_device", 2);
    });
  });

  describe("path-based deletion", () => {
    it("should delete a device by path", () => {
      const { parents } = setupDeviceMocks(
        "device_by_path",
        String(livePath.track(0).device(1)),
      );

      const result = deleteObject({ path: "t0/d1", type: "device" });

      expect(result).toStrictEqual({
        id: "device_by_path",
        type: "device",
        deleted: true,
      });
      expect(parents.get(String(livePath.track(0)))?.call).toHaveBeenCalledWith(
        "delete_device",
        1,
      );
    });

    it("should delete multiple devices by path", () => {
      setupDeviceMocks(["dev_0_0", "dev_1_1"], {
        dev_0_0: String(livePath.track(0).device(0)),
        dev_1_1: String(livePath.track(1).device(1)),
      });

      const result = deleteObject({ path: "t0/d0, t1/d1", type: "device" });

      expect(result).toStrictEqual([
        { id: "dev_0_0", type: "device", deleted: true },
        { id: "dev_1_1", type: "device", deleted: true },
      ]);
    });

    it("should delete devices from both ids and path", () => {
      setupDeviceMocks(["dev_by_id", "dev_by_path"], {
        dev_by_id: String(livePath.track(1).device(1)),
        dev_by_path: String(livePath.track(0).device(0)),
      });

      const result = deleteObject({
        ids: "dev_by_id",
        path: "t0/d0",
        type: "device",
      });

      expect(result).toStrictEqual([
        { id: "dev_by_id", type: "device", deleted: true },
        { id: "dev_by_path", type: "device", deleted: true },
      ]);
    });

    it("should delete nested device by path", () => {
      const { parents } = setupDeviceMocks(
        "nested_dev",
        "live_set tracks 1 devices 0 chains 2 devices 1",
      );

      const result = deleteObject({ path: "t1/d0/c2/d1", type: "device" });

      expect(result).toStrictEqual({
        id: "nested_dev",
        type: "device",
        deleted: true,
      });
      expect(
        parents.get("live_set tracks 1 devices 0 chains 2")?.call,
      ).toHaveBeenCalledWith("delete_device", 1);
    });

    it("should skip invalid paths and continue with valid ones", () => {
      setupDeviceMocks("valid_dev", String(livePath.track(0).device(0)));

      const result = deleteObject({ path: "t0/d0, t99/d99", type: "device" });

      expect(result).toStrictEqual({
        id: "valid_dev",
        type: "device",
        deleted: true,
      });
    });

    it("should return empty array when all paths are invalid", () => {
      const result = deleteObject({ path: "t99/d99", type: "device" });

      expect(result).toStrictEqual([]);
    });

    it("should warn when path is used with non-device/drum-pad type", () => {
      const consoleSpy = vi.spyOn(console, "warn");

      registerMockObject("track_1", {
        path: livePath.track(0),
        type: "Track",
      });

      deleteObject({ ids: "track_1", path: "0/0", type: "track" });

      expect(consoleSpy).toHaveBeenCalledWith(
        'delete: path parameter is only valid for types "device" or "drum-pad", ignoring paths',
      );
    });

    it("should delete a device nested inside a drum chain by path", () => {
      const drumRackPath = String(livePath.track(1).device(0));
      const chainId = "chain-1";
      const deviceId = "nested-device";
      const devicePath = `${String(livePath.track(1).device(0))} chains 0 devices 0`;
      const chainPath = `${String(livePath.track(1).device(0))} chains 0`;

      registerMockObject("drum-rack", {
        path: drumRackPath,
        type: "DrumGroupDevice",
        properties: {
          chains: children(chainId),
          can_have_drum_pads: 1,
        },
      });

      const chain = registerMockObject(chainId, {
        path: chainPath,
        type: "DrumChain",
        properties: {
          in_note: 36, // C1
          devices: children(deviceId),
        },
      });

      registerMockObject(deviceId, {
        path: devicePath,
        type: "Device",
      });

      const result = deleteObject({ path: "t1/d0/pC1/c0/d0", type: "device" });

      expect(result).toStrictEqual({
        id: deviceId,
        type: "device",
        deleted: true,
      });
      // Should call delete_device on the chain containing the device
      expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
    });
  });

  describe("drum-pad deletion", () => {
    it("should delete a drum pad by id", () => {
      const id = "drum_pad_1";

      const { devices } = setupDrumPadMocks(
        id,
        "live_set tracks 0 devices 0 drum_pads 36",
      );

      const result = deleteObject({ ids: id, type: "drum-pad" });

      expect(result).toStrictEqual({ id, type: "drum-pad", deleted: true });
      expect(devices.get(id)?.call).toHaveBeenCalledWith("delete_all_chains");
    });

    it("should delete multiple drum pads by id", () => {
      const { devices } = setupDrumPadMocks(["pad_1", "pad_2"], {
        pad_1: "live_set tracks 0 devices 0 drum_pads 36",
        pad_2: "live_set tracks 0 devices 0 drum_pads 37",
      });

      const result = deleteObject({ ids: "pad_1, pad_2", type: "drum-pad" });

      expect(result).toStrictEqual([
        { id: "pad_1", type: "drum-pad", deleted: true },
        { id: "pad_2", type: "drum-pad", deleted: true },
      ]);
      expect(devices.get("pad_1")?.call).toHaveBeenCalledWith(
        "delete_all_chains",
      );
      expect(devices.get("pad_2")?.call).toHaveBeenCalledWith(
        "delete_all_chains",
      );
    });

    it("should delete a drum chain by path", () => {
      const chainId = "chain-36";

      const { chain } = setupDrumChainMocks({
        devicePath: "live_set tracks 0 devices 0",
        chainPath: "live_set tracks 0 devices 0 chains 0",
        drumRackId: "drum-rack-1",
        chainId,
      });

      const result = deleteObject({ path: "t0/d0/pC1", type: "drum-pad" });

      expect(result).toStrictEqual({
        id: chainId,
        type: "drum-pad",
        deleted: true,
      });
      expect(chain.call).toHaveBeenCalledWith("delete_all_chains");
    });

    it("should delete drum pads from both ids and path", () => {
      const chainId = "chain-36";

      const { chain, extraPads } = setupDrumChainMocks({
        devicePath: "live_set tracks 0 devices 0",
        chainPath: "live_set tracks 0 devices 0 chains 0",
        drumRackId: "drum-rack-1",
        chainId,
        extraPadPath: {
          pad_by_id: "live_set tracks 0 devices 0 drum_pads 37",
        },
      });

      const result = deleteObject({
        ids: "pad_by_id",
        path: "t0/d0/pC1",
        type: "drum-pad",
      });

      expect(result).toStrictEqual([
        { id: "pad_by_id", type: "drum-pad", deleted: true },
        { id: chainId, type: "drum-pad", deleted: true },
      ]);
      expect(extraPads.get("pad_by_id")?.call).toHaveBeenCalledWith(
        "delete_all_chains",
      );
      expect(chain.call).toHaveBeenCalledWith("delete_all_chains");
    });

    it("should skip invalid drum chain paths and continue with valid ones", () => {
      const chainId = "chain-36";

      const { chain } = setupDrumChainMocks({
        devicePath: "live_set tracks 0 devices 0",
        chainPath: "live_set tracks 0 devices 0 chains 0",
        drumRackId: "drum-rack-1",
        chainId,
      });

      const result = deleteObject({
        path: "t0/d0/pC1, t99/d99/pC1",
        type: "drum-pad",
      });

      expect(result).toStrictEqual({
        id: chainId,
        type: "drum-pad",
        deleted: true,
      });
      expect(chain.call).toHaveBeenCalledWith("delete_all_chains");
    });

    it("should warn when path resolves to device instead of drum-pad", () => {
      const consoleSpy = vi.spyOn(console, "warn");

      // Path 0/0 resolves to device, not drum-pad - this results in no valid IDs
      expect(() => deleteObject({ path: "t0/d0", type: "drum-pad" })).toThrow(
        "delete failed: ids or path is required",
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'delete: path "t0/d0" resolves to device, not drum-pad',
      );
    });
  });
});
