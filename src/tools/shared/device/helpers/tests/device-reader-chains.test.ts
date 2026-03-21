// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DEVICE_TYPE } from "#src/tools/constants.ts";
import { processDeviceChains } from "../device-reader-helpers.ts";

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

describe("processDeviceChains", () => {
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
    getChildren: (child: string) => {
      if (child === "devices") return overrides.devices ?? [];

      return [];
    },
  });

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
    const mockDevice = {
      getChildren: (child: string) => {
        if (child === "chains") return [];

        if (child === "return_chains") {
          return [createMockChain("Return A"), createMockChain("Return B")];
        }

        return [];
      },
    };

    const deviceInfo: DeviceInfoResult = {};
    const mockReadDevice = (d: { id: string }) => ({
      id: d.id,
      type: "effect",
    });

    callWithReturnChains(mockDevice, deviceInfo, mockReadDevice, "t0/d0");

    expect(deviceInfo.returnChains).toHaveLength(2);

    const chains = deviceInfo.returnChains as ReturnChain[];

    expect(chains[0]).toMatchObject({
      id: "chain-Return A",
      name: "Return A",
    });
    expect(chains[1]).toMatchObject({
      id: "chain-Return B",
      name: "Return B",
    });
  });

  it("skips return chains when device has none", () => {
    const mockDevice = {
      getChildren: (child: string) => {
        if (child === "chains") return [];
        if (child === "return_chains") return [];

        return [];
      },
    };

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
      getChildren: (child: string) => {
        if (child === "devices") return [mockNestedDevice];

        return [];
      },
    });

    const mockDevice = {
      getChildren: (child: string) => {
        if (child === "chains") return [];
        if (child === "return_chains") return [createReturnChain("Return A")];

        return [];
      },
    };

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
    expect(chains[0]?.devices?.[0]).toMatchObject({
      id: "nested-dev-1",
      type: "effect",
    });
    // Verify readDevice was called with correct nested path
    expect(readDeviceCalls).toHaveLength(1);

    const firstCall = readDeviceCalls[0] as (typeof readDeviceCalls)[0];

    expect(firstCall.options.parentPath).toBe("t0/d0/rc0/d0");
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
      getChildren: (child: string) => {
        if (child === "devices") return [mockDevice1, mockDevice2];

        return [];
      },
    };

    const mockDevice = {
      getChildren: (child: string) => {
        if (child === "chains") return [mockChain];
        if (child === "return_chains") return [];

        return [];
      },
    };

    const deviceInfo: Record<string, unknown> = {};
    const readDeviceCalls: unknown[] = [];

    const mockReadDevice = (
      d: { id: string },
      opts: Record<string, unknown>,
    ) => {
      readDeviceCalls.push({ d, opts });

      return { id: d.id };
    };

    processDeviceChains(
      mockDevice as unknown as LiveAPI,
      deviceInfo,
      DEVICE_TYPE.INSTRUMENT_RACK,
      {
        includeChains: true,
        includeReturnChains: false,
        includeDrumPads: false,
        depth: 2,
        maxDepth: 2,
        readDeviceFn: mockReadDevice,
        devicePath: "t0/d0",
      },
    );

    const chains = deviceInfo.chains as Record<string, unknown>[];

    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({
      id: "chain-A",
      name: "Chain A",
      deviceCount: 2,
    });
    // readDeviceFn should NOT have been called (depth limit reached)
    expect(readDeviceCalls).toHaveLength(0);
    // devices should not be present since we got deviceCount instead
    expect(chains[0]).not.toHaveProperty("devices");
  });

  it("sets hasSoloedChain when a rack chain is soloed", () => {
    const createSoloChain = (name: string, solo: number) => ({
      id: `chain-${name}`,
      type: "Chain",
      getProperty: (prop: string) => {
        if (prop === "name") return name;
        if (prop === "solo") return solo;

        return 0;
      },
      getColor: () => null,
      getChildren: () => [],
    });

    const mockDevice = {
      getChildren: (child: string) => {
        if (child === "chains") {
          return [createSoloChain("Chain A", 0), createSoloChain("Chain B", 1)];
        }

        if (child === "return_chains") return [];

        return [];
      },
    };

    const deviceInfo: Record<string, unknown> = {};

    processDeviceChains(
      mockDevice as unknown as LiveAPI,
      deviceInfo,
      DEVICE_TYPE.AUDIO_EFFECT_RACK,
      {
        includeChains: true,
        includeReturnChains: false,
        includeDrumPads: false,
        depth: 0,
        maxDepth: 1,
        readDeviceFn: () => ({}),
        devicePath: "t0/d0",
      },
    );

    expect(deviceInfo.hasSoloedChain).toBe(true);
  });
});
