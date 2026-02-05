// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readDevice } from "./read-device.ts";
import { setupDrumPadMocks } from "./read-device-test-helpers.ts";

describe("readDevice with drum pad path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should read drum pad by path", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: { "pad-36": { note: 36, name: "Kick" } },
    });

    const result = readDevice({ path: "t1/d0/pC1", include: [] });

    expect(result).toStrictEqual({
      id: "pad-36",
      path: "t1/d0/pC1",
      name: "Kick",
      note: 36,
      pitch: "C1",
    });
  });

  it("should read muted drum pad", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: { "pad-36": { note: 36, name: "Kick", mute: 1 } },
    });

    const result = readDevice({ path: "t1/d0/pC1", include: [] });

    expect(result.state).toBe("muted");
  });

  it("should read soloed drum pad", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: { "pad-36": { note: 36, name: "Kick", solo: 1 } },
    });

    const result = readDevice({ path: "t1/d0/pC1", include: [] });

    expect(result.state).toBe("soloed");
  });

  it("should read drum pad with chains when includeChains is requested", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: {
        "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
      },
      chainProperties: {
        "chain-1": {
          name: "Layer 1",
          color: 0xff0000,
          choke_group: 2,
          out_note: 48,
        },
      },
    });

    const result = readDevice({ path: "t1/d0/pC1", include: ["chains"] });

    const chains = result.chains as Record<string, unknown>[];

    expect(chains).toHaveLength(1);
    expect(chains[0]).toStrictEqual({
      id: "chain-1",
      path: "t1/d0/pC1/c0",
      type: "DrumChain",
      name: "Layer 1",
      color: "#FF0000",
      mappedPitch: "C2",
      chokeGroup: 2,
      devices: [],
    });
  });

  it("should read drum pad with chains containing devices", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: {
        "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
      },
      chainProperties: {
        "chain-1": {
          name: "Layer 1",
          color: 0xff0000,
          out_note: 48,
          deviceIds: ["device-1"],
        },
      },
      deviceProperties: {
        "device-1": {
          name: "Simpler",
          class_display_name: "Simpler",
          type: 1,
        },
      },
    });

    const result = readDevice({ path: "t1/d0/pC1", include: ["chains"] });

    const chains = result.chains as Array<Record<string, unknown>>;

    expect(chains).toHaveLength(1);
    const devices = chains[0]!.devices as Array<Record<string, unknown>>;

    expect(devices).toHaveLength(1);
    expect(devices[0]).toStrictEqual({
      id: "device-1",
      path: "t1/d0/pC1/c0/d0",
      type: "instrument: Simpler",
    });
  });

  it("should read drum pad chain by path", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: {
        "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
      },
      chainProperties: {
        "chain-1": { name: "Layer 1", color: 0x00ff00, out_note: 60 },
      },
    });

    const result = readDevice({ path: "t1/d0/pC1/c0" });

    expect(result).toStrictEqual({
      id: "chain-1",
      path: "t1/d0/pC1/c0",
      type: "DrumChain",
      name: "Layer 1",
      color: "#00FF00",
      mappedPitch: "C3",
      devices: [],
    });
  });

  it("should read drum pad chain with devices", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: {
        "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
      },
      chainProperties: {
        "chain-1": {
          name: "Layer 1",
          color: 0x00ff00,
          out_note: 60,
          deviceIds: ["device-1"],
        },
      },
      deviceProperties: {
        "device-1": {
          name: "Simpler",
          class_display_name: "Simpler",
          type: 1,
        },
      },
    });

    const result = readDevice({ path: "t1/d0/pC1/c0" });

    expect(result).toStrictEqual({
      id: "chain-1",
      path: "t1/d0/pC1/c0",
      type: "DrumChain",
      name: "Layer 1",
      color: "#00FF00",
      mappedPitch: "C3",
      devices: [
        {
          id: "device-1",
          path: "t1/d0/pC1/c0/d0",
          type: "instrument: Simpler",
        },
      ],
    });
  });

  it("should throw error when drum pad not found", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: { "pad-36": { note: 36, name: "Kick" } }, // C1, not C3
    });

    expect(() => readDevice({ path: "t1/d0/pC3" })).toThrow(
      "Drum pad C3 not found",
    );
  });

  it("should throw error for invalid drum pad note name", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: { "pad-36": { note: 36, name: "Kick" } },
    });

    expect(() => readDevice({ path: "t1/d0/pXYZ" })).toThrow(
      "Invalid drum pad note name: XYZ",
    );
  });

  it("should throw error for invalid chain index in drum pad", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: { "pad-36": { note: 36, name: "Kick", chainIds: [] } },
    });

    expect(() => readDevice({ path: "t1/d0/pC1/c5" })).toThrow(
      "Invalid chain index in path: t1/d0/pC1/c5",
    );
  });

  it("should read device inside drum pad chain", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: {
        "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
      },
      chainProperties: {
        "chain-1": { name: "Layer 1", deviceIds: ["device-1"] },
      },
      deviceProperties: {
        "device-1": {
          name: "Simpler",
          class_display_name: "Simpler",
          type: 1,
        },
      },
    });

    const result = readDevice({ path: "t1/d0/pC1/c0/d0" });

    expect(result.id).toBe("device-1");
    expect(result.type).toBe("instrument: Simpler");
  });

  it("should throw error for invalid device index in drum pad chain", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: {
        "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
      },
      chainProperties: { "chain-1": { name: "Layer 1", deviceIds: [] } },
    });

    expect(() => readDevice({ path: "t1/d0/pC1/c0/d5" })).toThrow(
      "Invalid device index in path: t1/d0/pC1/c0/d5",
    );
  });
});
