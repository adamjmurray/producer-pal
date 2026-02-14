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
import { deleteObject } from "./delete.ts";

describe("deleteObject device path error cases", () => {
  it("should warn when device path through drum pad does not exist", () => {
    const consoleSpy = vi.spyOn(console, "warn");
    const drumRackPath = livePath.track(0).device(0);
    const chainId = "chain-1";

    registerMockObject("drum-rack", {
      path: drumRackPath,
      type: "RackDevice",
      properties: {
        chains: children(chainId),
        can_have_drum_pads: 1,
      },
    });

    registerMockObject(chainId, {
      path: "live_set tracks 0 devices 0 chains 0",
      type: "DrumChain",
      properties: {
        in_note: 36, // C1
        devices: [], // No devices in chain
      },
    });

    // Path goes to drum pad chain, then asks for device 0 which doesn't exist
    const result = deleteObject({ path: "t0/d0/pC1/c0/d0", type: "device" });

    expect(result).toStrictEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: device at path "t0/d0/pC1/c0/d0" does not exist',
    );
  });

  it("should warn when device type requested but path resolves to chain", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    registerMockObject("device_0", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { chains: children("chain_0") },
    });

    registerMockObject("chain_0", {
      path: "live_set tracks 0 devices 0 chains 0",
      type: "Chain",
    });

    // Path t0/d0/c0 resolves to chain, not device
    const result = deleteObject({ path: "t0/d0/c0", type: "device" });

    expect(result).toStrictEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: path "t0/d0/c0" resolves to chain, not device',
    );
  });

  it("should warn and skip when path resolution throws an error", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    // Path with invalid format that causes resolvePathToLiveApi to throw
    // "t0/p" is invalid because drum pad notation requires a note (like "pC1")
    const result = deleteObject({ path: "t0/d0/p", type: "device" });

    expect(result).toStrictEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      "delete: Invalid drum pad note in path: t0/d0/p",
    );
  });

  it("should warn when direct device path does not exist", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    // Register as non-existent (id "0" makes exists() return false)
    registerMockObject("0", { path: livePath.track(0).device(0) });

    const result = deleteObject({ path: "t0/d0", type: "device" });

    expect(result).toStrictEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: device at path "t0/d0" does not exist',
    );
  });
});
