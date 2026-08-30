// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DEVICE_TYPE } from "#src/tools/constants.ts";
import { processDeviceChains } from "../device-reader-helpers.ts";

// A chain with no mixer device, so buildChainInfo adds no mixer fields.
const noMixer = { exists: () => false };

interface ReturnChain {
  id: string;
  name: string;
  path?: string;
  devices?: { id: string; type: string }[];
}

interface DeviceInfoResult {
  returnChains?: ReturnChain[];
  [key: string]: unknown;
}

type MockChainOverrides = { devices?: unknown[] };

type ReadDeviceFn = (
  device: { id: string },
  options: Record<string, unknown>,
) => Record<string, unknown>;

type ChainCallOverrides = {
  includeChains?: boolean;
  includeDrumPads?: boolean;
  depth?: number;
  maxDepth?: number;
  readDeviceFn?: ReadDeviceFn;
  devicePath?: string;
};

describe("processDeviceChains", () => {
  // A chain whose `solo` property is configurable, for hasSoloedChain coverage.
  const createSoloChain = (name: string, solo: number) => ({
    id: `chain-${name}`,
    type: "Chain",
    getProperty: (prop: string) => {
      if (prop === "name") return name;
      if (prop === "solo") return solo;

      return 0;
    },
    getColor: () => null,
    child: () => noMixer,
    getChildren: () => [],
    getChildCount: () => 0,
  });

  const createMockChain = (
    name: string,
    overrides: MockChainOverrides = {},
  ) => ({
    id: `chain-${name}`,
    type: "Chain",
    getProperty: (prop: string) => {
      if (prop === "name") return name;
      if (prop === "mute") return 0;
      if (prop === "solo") return 0;
      if (prop === "muted_via_solo") return 0;

      return 0;
    },
    getColor: () => null,
    child: () => noMixer,
    getChildren: (child: string) => {
      if (child === "devices") return overrides.devices ?? [];

      return [];
    },
    getChildCount: (child: string) =>
      child === "devices" ? (overrides.devices ?? []).length : 0,
  });

  // A rack device exposing the given chains and return chains.
  const createMockRackDevice = (
    chains: unknown[],
    returnChains: unknown[] = [],
  ) => ({
    getChildren: (child: string) => {
      if (child === "chains") return chains;
      if (child === "return_chains") return returnChains;

      return [];
    },
    getChildCount: (child: string) => {
      if (child === "chains") return chains.length;
      if (child === "return_chains") return returnChains.length;

      return 0;
    },
  });

  // Helper to call processDeviceChains with regular-chain options. Defaults
  // describe a one-level rack read; tests override only what they exercise.
  const callWithChains = (
    mockDevice: unknown,
    deviceInfo: Record<string, unknown>,
    deviceType: string,
    overrides: ChainCallOverrides = {},
  ) => {
    processDeviceChains(
      mockDevice as unknown as LiveAPI,
      deviceInfo,
      deviceType,
      {
        includeChains: true,
        includeReturnChains: false,
        includeDrumPads: false,
        depth: 0,
        maxDepth: 1,
        readDeviceFn: () => ({}),
        devicePath: "t0/d0",
        ...overrides,
      },
    );
  };

  // Helper to call processDeviceChains with return chain options
  const callWithReturnChains = (
    mockDevice: unknown,
    deviceInfo: DeviceInfoResult,
    readDeviceFn: (
      d: { id: string },
      opts: Record<string, unknown>,
    ) => Record<string, unknown> = () => ({}),
    devicePath?: string,
  ) => {
    processDeviceChains(
      mockDevice as unknown as LiveAPI,
      deviceInfo,
      DEVICE_TYPE.AUDIO_EFFECT_RACK,
      {
        includeChains: false,
        includeReturnChains: true,
        includeDrumPads: false,
        depth: 0,
        maxDepth: 2,
        readDeviceFn,
        devicePath,
      },
    );
  };

  it("processes return chains when includeReturnChains is true", () => {
    const mockDevice = createMockRackDevice(
      [],
      [createMockChain("Return A"), createMockChain("Return B")],
    );

    const deviceInfo: DeviceInfoResult = {};
    const mockReadDevice = (d: { id: string }) => ({
      id: d.id,
      type: "effect",
    });

    callWithReturnChains(mockDevice, deviceInfo, mockReadDevice, "t0/d0");

    expect(deviceInfo.returnChains).toHaveLength(2);

    const chains = deviceInfo.returnChains as ReturnChain[];

    expect(chains[0]).toStrictEqual({
      devices: [],
      path: "t0/d0/rc0",
      type: "Chain",
      id: "chain-Return A",
      name: "Return A",
    });
    expect(chains[1]).toStrictEqual({
      devices: [],
      path: "t0/d0/rc1",
      type: "Chain",
      id: "chain-Return B",
      name: "Return B",
    });
  });

  it("skips return chains when device has none", () => {
    const mockDevice = createMockRackDevice([], []);

    const deviceInfo: DeviceInfoResult = {};

    callWithReturnChains(mockDevice, deviceInfo);

    expect(deviceInfo.returnChains).toBeUndefined();
  });

  it("processes return chains with nested devices and builds paths", () => {
    const mockNestedDevice = { id: "nested-dev-1" };
    const createReturnChain = (name: string) => ({
      id: `return-chain-${name}`,
      type: "Chain",
      getProperty: (prop: string) => {
        if (prop === "name") return name;

        return 0;
      },
      getColor: () => null,
      child: () => noMixer,
      getChildren: (child: string) => {
        if (child === "devices") return [mockNestedDevice];

        return [];
      },
    });

    const mockDevice = createMockRackDevice(
      [],
      [createReturnChain("Return A")],
    );

    const deviceInfo: DeviceInfoResult = {};

    const readDeviceCalls: {
      device: { id: string };
      options: Record<string, unknown>;
    }[] = [];

    const mockReadDevice = (
      device: { id: string },
      options: Record<string, unknown>,
    ) => {
      readDeviceCalls.push({ device, options });

      return { id: device.id, type: "effect" };
    };

    callWithReturnChains(mockDevice, deviceInfo, mockReadDevice, "t0/d0");

    const chains = deviceInfo.returnChains as ReturnChain[];

    expect(chains).toHaveLength(1);
    expect(chains[0]?.devices).toHaveLength(1);
    expect(chains[0]?.devices?.[0]).toStrictEqual({
      id: "nested-dev-1",
      type: "effect",
    });
    // Verify readDevice was called with correct nested path
    expect(readDeviceCalls).toHaveLength(1);

    const firstCall = readDeviceCalls[0] as (typeof readDeviceCalls)[0];

    expect(firstCall.options.parentPath).toBe("t0/d0/rc0/d0");
    // Nested devices are read one level deeper than the chain (depth + 1).
    expect(firstCall.options.depth).toBe(1);
  });

  it("returns deviceCount instead of expanding devices when depth >= maxDepth", () => {
    const mockDevice1 = { id: "dev-1" };
    const mockDevice2 = { id: "dev-2" };
    const mockChain = {
      id: "chain-A",
      type: "Chain",
      getProperty: (prop: string) => {
        if (prop === "name") return "Chain A";

        return 0;
      },
      getColor: () => null,
      child: () => noMixer,
      getChildren: (child: string) => {
        if (child === "devices") return [mockDevice1, mockDevice2];

        return [];
      },
      getChildCount: (child: string) => (child === "devices" ? 2 : 0),
    };

    const mockDevice = createMockRackDevice([mockChain]);

    const deviceInfo: Record<string, unknown> = {};
    const readDeviceCalls: unknown[] = [];

    const mockReadDevice = (
      d: { id: string },
      opts: Record<string, unknown>,
    ) => {
      readDeviceCalls.push({ d, opts });

      return { id: d.id };
    };

    callWithChains(mockDevice, deviceInfo, DEVICE_TYPE.INSTRUMENT_RACK, {
      depth: 2,
      maxDepth: 2,
      readDeviceFn: mockReadDevice,
    });

    const chains = deviceInfo.chains as Record<string, unknown>[];

    expect(chains).toHaveLength(1);
    expect(chains[0]).toStrictEqual({
      path: "t0/d0/c0",
      type: "Chain",
      id: "chain-A",
      name: "Chain A",
      deviceCount: 2,
    });
    // readDeviceFn should NOT have been called (depth limit reached)
    expect(readDeviceCalls).toHaveLength(0);
    // devices should not be present since we got deviceCount instead
    expect(chains[0]).not.toHaveProperty("devices");
  });

  it("builds null chain/device paths when devicePath is omitted", () => {
    const mockChain = createMockChain("Chain A", {
      devices: [{ id: "dev-1" }],
    });
    const mockDevice = createMockRackDevice([mockChain]);

    const deviceInfo: Record<string, unknown> = {};
    const readDeviceCalls: Record<string, unknown>[] = [];

    const mockReadDevice = (
      d: { id: string },
      opts: Record<string, unknown>,
    ) => {
      readDeviceCalls.push(opts);

      return { id: d.id };
    };

    callWithChains(mockDevice, deviceInfo, DEVICE_TYPE.INSTRUMENT_RACK, {
      maxDepth: 2,
      readDeviceFn: mockReadDevice,
      // devicePath overridden to undefined → chainPath and nested device path null
      devicePath: undefined,
    });

    const chains = deviceInfo.chains as Record<string, unknown>[];

    // buildChainInfo omits a falsy (null) path.
    expect(chains[0]?.path).toBeUndefined();
    // Nested device path is null too (chainPath was null).
    expect(readDeviceCalls[0]?.parentPath).toBeNull();
    // Regular-chain nested devices carry the full recursion options: one level
    // deeper (depth + 1) and the propagated include flags.
    expect(readDeviceCalls[0]?.depth).toBe(1);
    expect(readDeviceCalls[0]?.includeChains).toBe(true);
  });

  it("builds null return-chain paths when devicePath is omitted", () => {
    const mockDevice = createMockRackDevice([], [createMockChain("Return A")]);

    const deviceInfo: DeviceInfoResult = {};

    callWithReturnChains(mockDevice, deviceInfo); // no devicePath

    const chains = deviceInfo.returnChains as ReturnChain[];

    expect(chains).toHaveLength(1);
    expect(chains[0]?.path).toBeUndefined();
  });

  it("sets hasSoloedChain when a rack chain is soloed", () => {
    const mockDevice = createMockRackDevice([
      createSoloChain("Chain A", 0),
      createSoloChain("Chain B", 1),
    ]);

    const deviceInfo: Record<string, unknown> = {};

    callWithChains(mockDevice, deviceInfo, DEVICE_TYPE.AUDIO_EFFECT_RACK);

    expect(deviceInfo.hasSoloedChain).toBe(true);
  });

  it("omits hasSoloedChain when no rack chain is soloed", () => {
    const mockDevice = createMockRackDevice([
      createSoloChain("Chain A", 0),
      createSoloChain("Chain B", 0),
    ]);

    const deviceInfo: Record<string, unknown> = {};

    callWithChains(mockDevice, deviceInfo, DEVICE_TYPE.AUDIO_EFFECT_RACK);

    expect(deviceInfo.hasSoloedChain).toBeUndefined();
  });

  it("does not build chains when includeChains is false (drum-pad-only read of a plain rack)", () => {
    const mockChain = createMockChain("Chain A", {
      devices: [{ id: "dev-1" }],
    });
    const mockDevice = createMockRackDevice([mockChain]);

    const deviceInfo: Record<string, unknown> = {};

    // A non-drum rack asked only for drum pads still runs processRegularChains,
    // but the `if (includeChains)` guard must keep `chains` out of the output.
    callWithChains(mockDevice, deviceInfo, DEVICE_TYPE.AUDIO_EFFECT_RACK, {
      includeChains: false,
      includeDrumPads: true,
      maxDepth: 2,
    });

    expect(deviceInfo.chains).toBeUndefined();
  });
});
