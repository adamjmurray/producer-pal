// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "../delete.ts";

describe("deleteObject device path error cases", () => {
  it("reports a device path through a drum pad that holds nothing", () => {
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

    expect(result).toStrictEqual({
      path: "t0/d0/pC1/c0/d0",
      type: "device",
      reason: "nothing to delete",
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("refuses a device delete whose path resolves to a chain", () => {
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
    expect(() => deleteObject({ path: "t0/d0/c0", type: "device" })).toThrow(
      'path "t0/d0/c0" resolves to chain, not device',
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("refuses a malformed path with the message it raised", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    // Path with invalid format that causes resolvePathToLiveApi to throw
    // "t0/p" is invalid because drum pad notation requires a note (like "pC1")
    expect(() => deleteObject({ path: "t0/d0/p", type: "device" })).toThrow(
      'invalid path "t0/d0/p" - "p" is not a device, chain, or drum pad',
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("refuses a device whose Live path has no parent segment", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    // A device path that begins with "devices N" has nothing before the last
    // "devices" match, so the extracted parent path is empty.
    registerMockObject("orphan-device", {
      path: "devices 0",
      type: "Device",
    });

    expect(() => deleteObject({ id: "orphan-device", type: "device" })).toThrow(
      'no parent path for device id orphan-device (Live path "devices 0")',
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("reports a direct device path that holds nothing", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    // Register as non-existent (id "0" makes exists() return false)
    registerMockObject("0", { path: livePath.track(0).device(0) });

    const result = deleteObject({ path: "t0/d0", type: "device" });

    expect(result).toStrictEqual({
      path: "t0/d0",
      type: "device",
      reason: "nothing to delete",
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
