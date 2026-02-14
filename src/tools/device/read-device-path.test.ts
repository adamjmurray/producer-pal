// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "./read-device.ts";
import {
  setupBasicDeviceMock,
  setupChainMock,
} from "./read-device-test-helpers.ts";

describe("readDevice with path parameter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("should throw error when neither deviceId nor path is provided", () => {
    expect(() => readDevice({})).toThrow(
      "Either deviceId or path must be provided",
    );
  });

  it("should throw error when both deviceId and path are provided", () => {
    expect(() => readDevice({ deviceId: "device-123", path: "t1/d0" })).toThrow(
      "Provide either deviceId or path, not both",
    );
  });

  it("should read device by path", () => {
    setupBasicDeviceMock({
      id: "device-456",
      path: "live_set tracks 1 devices 0",
      class_display_name: "Operator",
      type: 1,
    });
    const result = readDevice({ path: "t1/d0" });

    expect(result).toStrictEqual({
      id: "device-456",
      path: "t1/d0",
      type: "instrument: Operator",
    });
  });

  it("should throw error for non-existent device by path", () => {
    mockNonExistentObjects();

    expect(() => readDevice({ path: "t1/d0" })).toThrow(
      "Device not found at path: live_set tracks 1 devices 0",
    );
  });

  it("should read chain by path with id property", () => {
    setupChainMock({ id: "chain-789", name: "Chain 1" });
    const result = readDevice({ path: "t1/d0/c0" });

    expect(result).toStrictEqual({
      id: "chain-789",
      path: "t1/d0/c0",
      type: "Chain",
      name: "Chain 1",
      devices: [],
    });
  });

  it("should read chain with color property", () => {
    setupChainMock({
      id: "chain-with-color",
      name: "Colored Chain",
      color: 0xff5500,
    });
    const result = readDevice({ path: "t1/d0/c0" });

    expect(result).toStrictEqual({
      id: "chain-with-color",
      path: "t1/d0/c0",
      type: "Chain",
      name: "Colored Chain",
      color: "#FF5500",
      devices: [],
    });
  });

  it("should read chain with green color property", () => {
    setupChainMock({ id: "chain-123", name: "Test Chain", color: 0x00ff00 });
    const result = readDevice({ path: "t1/d0/c0" });

    expect(result).toStrictEqual({
      id: "chain-123",
      path: "t1/d0/c0",
      type: "Chain",
      name: "Test Chain",
      color: "#00FF00",
      devices: [],
    });
  });

  it("should read chain with devices", () => {
    // Register the device in the chain
    registerMockObject("device-in-chain", {
      path: livePath.track(0).device(1),
      type: "Device",
      properties: {
        name: "Simpler",
        class_display_name: "Simpler",
        type: 1,
        can_have_chains: 0,
        can_have_drum_pads: 0,
        is_active: 1,
      },
    });

    // Register the chain with the device
    setupChainMock({
      id: "chain-with-devices",
      name: "Chain With Devices",
      mute: 0,
      solo: 0,
      deviceIds: ["device-in-chain"],
    });

    const result = readDevice({ path: "t1/d0/c0" });

    expect(result).toStrictEqual({
      id: "chain-with-devices",
      path: "t1/d0/c0",
      type: "Chain",
      name: "Chain With Devices",
      devices: [
        {
          id: "device-in-chain",
          path: "t0/d1",
          type: "instrument: Simpler",
        },
      ],
    });
  });

  it("should omit chokeGroup for regular chains (not DrumChain type)", () => {
    setupChainMock({ id: "chain-no-choke", name: "Regular Chain" });
    const result = readDevice({ path: "t1/d0/c0" });

    // Regular chains (type: "Chain") don't have chokeGroup - only DrumChain type does
    expect(result.type).toBe("Chain");
    expect(result.chokeGroup).toBeUndefined();
  });

  it("should throw error for non-existent chain by path", () => {
    mockNonExistentObjects();

    expect(() => readDevice({ path: "t1/d0/c0" })).toThrow(
      "Chain not found at path: t1/d0/c0",
    );
  });

  it("should read return chain by path with enriched properties", () => {
    setupChainMock({
      id: "return-chain-101",
      path: "live_set tracks 1 devices 0 return_chains 0",
      name: "Return A",
      color: 0x0088ff,
    });
    const result = readDevice({ path: "t1/d0/rc0" });

    expect(result).toStrictEqual({
      id: "return-chain-101",
      path: "t1/d0/rc0",
      type: "Chain",
      name: "Return A",
      color: "#0088FF",
      devices: [],
    });
  });

  it("should read muted chain by path with enriched properties", () => {
    setupChainMock({ id: "chain-muted", name: "Muted Chain", mute: 1 });
    const result = readDevice({ path: "t1/d0/c0" });

    expect(result).toStrictEqual({
      id: "chain-muted",
      path: "t1/d0/c0",
      type: "Chain",
      name: "Muted Chain",
      state: "muted",
      devices: [],
    });
  });

  it("should throw error for empty path (treated as no path)", () => {
    expect(() => readDevice({ path: "" })).toThrow(
      "Either deviceId or path must be provided",
    );
  });

  it("should throw error for track-only path", () => {
    expect(() => readDevice({ path: "t1" })).toThrow(
      "Path must include at least a device index",
    );
  });

  it("should read device from return track by path", () => {
    setupBasicDeviceMock({
      id: "return-device-123",
      path: "live_set return_tracks 0 devices 0",
      class_display_name: "Reverb",
      type: 2,
    });
    const result = readDevice({ path: "rt0/d0" });

    expect(result).toStrictEqual({
      id: "return-device-123",
      path: "rt0/d0",
      type: "audio-effect: Reverb",
    });
  });

  it("should read device from master track by path", () => {
    setupBasicDeviceMock({
      id: "master-device-123",
      path: "live_set master_track devices 0",
      class_display_name: "Limiter",
      type: 2,
    });
    const result = readDevice({ path: "mt/d0" });

    expect(result).toStrictEqual({
      id: "master-device-123",
      path: "mt/d0",
      type: "audio-effect: Limiter",
    });
  });

  it("should throw error when device not found at drum pad path", () => {
    mockNonExistentObjects();

    expect(() => readDevice({ path: "t1/d0/pC3" })).toThrow(
      "Device not found at path: live_set tracks 1 devices 0",
    );
  });
});
