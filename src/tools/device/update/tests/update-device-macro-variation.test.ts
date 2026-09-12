// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "../update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateDevice - macroVariation", () => {
  let rackDevice: RegisteredMockObject;
  let nonRackDevice: RegisteredMockObject;

  beforeEach(() => {
    // Default: rack device with 3 variations, variation 1 selected
    rackDevice = registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        can_have_chains: 1,
        variation_count: 3,
        selected_variation_index: 1,
      },
    });

    // Non-rack device (can_have_chains = 0)
    nonRackDevice = registerMockObject("456", {
      path: livePath.track(0).device(1),
      type: "RackDevice",
      properties: { can_have_chains: 0 },
    });
  });

  // An out-of-range index warns and aborts the whole action — not just the
  // index-set — and the device is still reported.
  function expectVariationIndexRejected(index: number): void {
    const result = updateDevice({
      id: "123",
      macroVariation: "load",
      macroVariationIndex: index,
    });

    expect(capturedWarnings()).toContain(
      `variation index ${index} out of range on t0/d0 (id 123) (3 available)`,
    );
    expect(rackDevice.set).not.toHaveBeenCalledWith(
      "selected_variation_index",
      expect.anything(),
    );
    expect(rackDevice.call).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  }

  it("should reject non-rack devices with error", () => {
    const result = updateDevice({
      id: "456",
      macroVariation: "create",
    });

    expect(capturedWarnings()).toContain(
      "macro variations only available on rack devices; skipping t0/d1 (id 456)",
    );
    expect(nonRackDevice.call).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "456", path: "t0/d1" });
  });

  it("should reject out-of-range variation index", () => {
    expectVariationIndexRejected(5);
  });

  it("should reject an index equal to variation_count (boundary)", () => {
    // variation_count is 3, so valid indices are 0-2; index 3 is out of range.
    // This pins the `>=` bound: a `>` mutant would accept index 3.
    expectVariationIndexRejected(3);
  });

  it("should call store_variation for 'create'", () => {
    const result = updateDevice({
      id: "123",
      macroVariation: "create",
    });

    expect(rackDevice.call).toHaveBeenCalledWith("store_variation");
    // 'create' never selects an index, and with no index there is nothing to
    // warn about being ignored.
    expect(rackDevice.set).not.toHaveBeenCalledWith(
      "selected_variation_index",
      expect.anything(),
    );
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("ignored"),
    );
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should call recall_selected_variation for 'load'", () => {
    const result = updateDevice({
      id: "123",
      macroVariation: "load",
      macroVariationIndex: 1,
    });

    // 'load' selects the index first, then recalls it; a valid index is used,
    // not ignored.
    expect(rackDevice.set).toHaveBeenCalledWith("selected_variation_index", 1);
    expect(rackDevice.call).toHaveBeenCalledWith("recall_selected_variation");
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("ignored"),
    );
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should call recall_last_used_variation for 'revert'", () => {
    const result = updateDevice({
      id: "123",
      macroVariation: "revert",
    });

    expect(rackDevice.call).toHaveBeenCalledWith("recall_last_used_variation");
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should call delete_selected_variation for 'delete'", () => {
    const result = updateDevice({
      id: "123",
      macroVariation: "delete",
      macroVariationIndex: 1,
    });

    // 'delete' also selects the index before deleting it.
    expect(rackDevice.set).toHaveBeenCalledWith("selected_variation_index", 1);
    expect(rackDevice.call).toHaveBeenCalledWith("delete_selected_variation");
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should call randomize_macros for 'randomize'", () => {
    const result = updateDevice({
      id: "123",
      macroVariation: "randomize",
    });

    expect(rackDevice.call).toHaveBeenCalledWith("randomize_macros");
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should set index before executing action for 'load'", () => {
    const callOrder: string[] = [];

    rackDevice.set.mockImplementation(() => {
      callOrder.push("set");
    });
    rackDevice.call.mockImplementation(() => {
      callOrder.push("call");
    });

    updateDevice({
      id: "123",
      macroVariationIndex: 0,
      macroVariation: "load",
    });

    expect(callOrder).toStrictEqual(["set", "call"]);
    expect(rackDevice.set).toHaveBeenCalledWith("selected_variation_index", 0);
    expect(rackDevice.call).toHaveBeenCalledWith("recall_selected_variation");
  });

  it("should warn and ignore when macroVariationIndex provided alone", () => {
    const result = updateDevice({
      id: "123",
      macroVariationIndex: 2,
    });

    expect(capturedWarnings()).toContain(
      "macroVariationIndex requires macroVariation 'load' or 'delete'",
    );
    expect(rackDevice.set).not.toHaveBeenCalledWith(
      "selected_variation_index",
      expect.anything(),
    );
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should warn and skip when 'load' provided without index", () => {
    const result = updateDevice({
      id: "123",
      macroVariation: "load",
    });

    expect(capturedWarnings()).toContain(
      "macroVariation 'load' requires macroVariationIndex",
    );
    expect(rackDevice.call).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should warn and skip when 'delete' provided without index", () => {
    const result = updateDevice({
      id: "123",
      macroVariation: "delete",
    });

    expect(capturedWarnings()).toContain(
      "macroVariation 'delete' requires macroVariationIndex",
    );
    expect(rackDevice.call).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should warn but still create when 'create' provided with index", () => {
    const result = updateDevice({
      id: "123",
      macroVariation: "create",
      macroVariationIndex: 1,
    });

    expect(capturedWarnings()).toContain(
      "macroVariationIndex ignored for 'create' (variations always appended)",
    );
    // The index is ignored for 'create': it must NOT be written as a selection.
    expect(rackDevice.set).not.toHaveBeenCalledWith(
      "selected_variation_index",
      expect.anything(),
    );
    expect(rackDevice.call).toHaveBeenCalledWith("store_variation");
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should warn but still revert when 'revert' provided with index", () => {
    const result = updateDevice({
      id: "123",
      macroVariation: "revert",
      macroVariationIndex: 1,
    });

    expect(capturedWarnings()).toContain(
      "macroVariationIndex ignored for 'revert'",
    );
    expect(rackDevice.call).toHaveBeenCalledWith("recall_last_used_variation");
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should warn but still randomize when 'randomize' provided with index", () => {
    const result = updateDevice({
      id: "123",
      macroVariation: "randomize",
      macroVariationIndex: 1,
    });

    expect(capturedWarnings()).toContain(
      "macroVariationIndex ignored for 'randomize'",
    );
    expect(rackDevice.call).toHaveBeenCalledWith("randomize_macros");
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });
});
