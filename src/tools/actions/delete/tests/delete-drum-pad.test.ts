// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  setupDrumPadMocks,
  setupDrumPadPathMocks,
} from "./delete-test-helpers.ts";
import { deleteObject } from "../delete.ts";

describe("deleteObject drum-pad deletion", () => {
  it("should delete a drum pad by id", () => {
    const id = "drum_pad_1";

    const { devices } = setupDrumPadMocks(
      id,
      "live_set tracks 0 devices 0 drum_pads 36",
    );

    const result = deleteObject({ id: id, type: "drum-pad" });

    expect(result).toStrictEqual({ id, type: "drum-pad", deleted: true });
    expect(devices.get(id)?.call).toHaveBeenCalledWith("delete_all_chains");
  });

  it("should delete multiple drum pads by id", () => {
    const { devices } = setupDrumPadMocks(["pad_1", "pad_2"], {
      pad_1: "live_set tracks 0 devices 0 drum_pads 36",
      pad_2: "live_set tracks 0 devices 0 drum_pads 37",
    });

    const result = deleteObject({ id: "pad_1, pad_2", type: "drum-pad" });

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

  it("should clear the DrumPad itself by path, not its chain", () => {
    const padId = "pad-36";

    const { pad } = setupDrumPadPathMocks({
      devicePath: "live_set tracks 0 devices 0",
      drumRackId: "drum-rack-1",
      padId,
    });

    const result = deleteObject({ path: "t0/d0/pC1", type: "drum-pad" });

    expect(result).toStrictEqual({
      id: padId,
      type: "drum-pad",
      deleted: true,
    });
    expect(pad.call).toHaveBeenCalledWith("delete_all_chains");
  });

  it("should clear a pad on a drum rack nested inside an instrument rack", () => {
    const padId = "pad-38";

    const { pad } = setupDrumPadPathMocks({
      devicePath: "live_set tracks 0 devices 0 chains 0 devices 0",
      drumRackId: "nested-drum-rack",
      padId,
      note: 38,
    });

    const result = deleteObject({
      path: "t0/d0/c0/d0/pD1",
      type: "drum-pad",
    });

    expect(result).toStrictEqual({
      id: padId,
      type: "drum-pad",
      deleted: true,
    });
    expect(pad.call).toHaveBeenCalledWith("delete_all_chains");
  });

  it("should warn when the pad note does not exist on the rack", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    setupDrumPadPathMocks({
      devicePath: "live_set tracks 0 devices 0",
      drumRackId: "drum-rack-1",
      padId: "pad-36",
    });

    const result = deleteObject({ path: "t0/d0/pD1", type: "drum-pad" });

    expect(result).toStrictEqual({
      path: "t0/d0/pD1",
      type: "drum-pad",
      deleted: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: drum-pad at path "t0/d0/pD1" does not exist',
    );
  });

  it("should delete drum pads from both ids and path", () => {
    const padId = "pad-36";

    const { pad, extraPads } = setupDrumPadPathMocks({
      devicePath: "live_set tracks 0 devices 0",
      drumRackId: "drum-rack-1",
      padId,
      extraPadPath: {
        pad_by_id: "live_set tracks 0 devices 0 drum_pads 37",
      },
    });

    const result = deleteObject({
      id: "pad_by_id",
      path: "t0/d0/pC1",
      type: "drum-pad",
    });

    expect(result).toStrictEqual([
      { id: "pad_by_id", type: "drum-pad", deleted: true },
      { id: padId, type: "drum-pad", deleted: true },
    ]);
    expect(extraPads.get("pad_by_id")?.call).toHaveBeenCalledWith(
      "delete_all_chains",
    );
    expect(pad.call).toHaveBeenCalledWith("delete_all_chains");
  });

  it("should skip invalid drum chain paths and continue with valid ones", () => {
    const padId = "pad-36";

    const { pad } = setupDrumPadPathMocks({
      devicePath: "live_set tracks 0 devices 0",
      drumRackId: "drum-rack-1",
      padId,
    });

    const result = deleteObject({
      path: "t0/d0/pC1, t99/d99/pC1",
      type: "drum-pad",
    });

    expect(result).toStrictEqual([
      { id: padId, type: "drum-pad", deleted: true },
      { path: "t99/d99/pC1", type: "drum-pad", deleted: false },
    ]);
    expect(pad.call).toHaveBeenCalledWith("delete_all_chains");
  });

  it("should warn when path resolves to device instead of drum-pad", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    // Path t0/d0 resolves to device, not drum-pad - returns empty results
    const result = deleteObject({ path: "t0/d0", type: "drum-pad" });

    expect(result).toStrictEqual({
      path: "t0/d0",
      type: "drum-pad",
      deleted: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: path "t0/d0" resolves to device, not drum-pad',
    );
  });
});

describe("deleteObject drum-pad refusals", () => {
  it("refuses a DrumChain id, which delete_all_chains ignores", () => {
    const consoleSpy = vi.spyOn(console, "warn");
    const chain = registerMockObject("drum-chain-1", {
      path: "live_set tracks 0 devices 0 chains 0",
      type: "DrumChain",
    });

    const result = deleteObject({ id: "drum-chain-1", type: "drum-pad" });

    expect(result).toStrictEqual({
      id: "drum-chain-1",
      type: "drum-pad",
      deleted: false,
    });
    expect(chain.call).not.toHaveBeenCalledWith("delete_all_chains");
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: id "drum-chain-1" is a DrumChain. Use type="chain" for this ' +
        'chain, or type="drum-pad" for the whole pad.',
    );
  });

  it("refuses a plain Chain id without the drum pad advice", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    registerMockObject("chain-1", {
      path: "live_set tracks 0 devices 0 chains 0",
      type: "Chain",
    });

    const result = deleteObject({ id: "chain-1", type: "device" });

    expect(result).toStrictEqual({
      id: "chain-1",
      type: "device",
      deleted: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: id "chain-1" is a Chain. Deleting rack chains is not supported.',
    );
  });

  it("deletes the pads a call names even when a chain id rides along", () => {
    const padId = "pad-36";

    const { pad } = setupDrumPadPathMocks({
      devicePath: "live_set tracks 0 devices 0",
      drumRackId: "drum-rack-1",
      padId,
    });

    registerMockObject("drum-chain-1", {
      path: "live_set tracks 0 devices 0 chains 0",
      type: "DrumChain",
    });

    const result = deleteObject({
      id: `drum-chain-1, ${padId}`,
      type: "drum-pad",
    });

    expect(result).toStrictEqual([
      { id: padId, type: "drum-pad", deleted: true },
      { id: "drum-chain-1", type: "drum-pad", deleted: false },
    ]);
    expect(pad.call).toHaveBeenCalledWith("delete_all_chains");
  });

  it("reports deleted false when the pad's chains survive the call", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    registerMockObject("stuck-pad", {
      path: "live_set tracks 0 devices 0 drum_pads 36",
      type: "DrumPad",
      properties: { chains: children("surviving-chain") },
    });

    const result = deleteObject({ id: "stuck-pad", type: "drum-pad" });

    expect(result).toStrictEqual({
      id: "stuck-pad",
      type: "drum-pad",
      deleted: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: drum pad "stuck-pad" still has chains, so Live did not clear it',
    );
  });

  it("refuses a chain path, which would clear the whole pad", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    const { pad } = setupDrumPadPathMocks({
      devicePath: "live_set tracks 0 devices 0",
      drumRackId: "drum-rack-1",
      padId: "pad-36",
    });

    const result = deleteObject({ path: "t0/d0/pC1/c0", type: "drum-pad" });

    expect(result).toStrictEqual({
      path: "t0/d0/pC1/c0",
      type: "drum-pad",
      deleted: false,
    });
    expect(pad.call).not.toHaveBeenCalledWith("delete_all_chains");
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: path "t0/d0/pC1/c0" names something inside a drum pad, not the ' +
        'pad itself (expected something like "t0/d0/pC1")',
    );
  });

  it("refuses a device path inside a pad", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    setupDrumPadPathMocks({
      devicePath: "live_set tracks 0 devices 0",
      drumRackId: "drum-rack-1",
      padId: "pad-36",
    });

    const result = deleteObject({ path: "t0/d0/pC1/c0/d0", type: "drum-pad" });

    expect(result).toStrictEqual({
      path: "t0/d0/pC1/c0/d0",
      type: "drum-pad",
      deleted: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: path "t0/d0/pC1/c0/d0" names something inside a drum pad, not ' +
        'the pad itself (expected something like "t0/d0/pC1")',
    );
  });

  it("refuses a pad of a nested Drum Rack, which has no pad to delete", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    setupDrumPadPathMocks({
      devicePath: "live_set tracks 0 devices 0",
      drumRackId: "drum-rack-1",
      padId: "pad-36",
    });

    const result = deleteObject({
      path: "t0/d0/pC1/c0/d0/pD1",
      type: "drum-pad",
    });

    expect(result).toStrictEqual({
      path: "t0/d0/pC1/c0/d0/pD1",
      type: "drum-pad",
      deleted: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: path "t0/d0/pC1/c0/d0/pD1" names a pad of a nested Drum Rack, ' +
        "which can't be deleted",
    );
  });
});
