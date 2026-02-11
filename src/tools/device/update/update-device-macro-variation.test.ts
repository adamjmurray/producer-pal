// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type MockObjectHandle,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "./update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateDevice - macroVariation", () => {
  let rackDevice: MockObjectHandle;
  let nonRackDevice: MockObjectHandle;

  beforeEach(() => {
    // Default: rack device with 3 variations, variation 1 selected
    rackDevice = registerMockObject("123", {
      path: "live_set tracks 0 devices 0",
      type: "RackDevice",
      properties: {
        can_have_chains: 1,
        variation_count: 3,
        selected_variation_index: 1,
      },
    });

    // Non-rack device (can_have_chains = 0)
    nonRackDevice = registerMockObject("456", {
      path: "live_set tracks 0 devices 1",
      type: "RackDevice",
      properties: { can_have_chains: 0 },
    });
  });

  it("should reject non-rack devices with error", () => {
    const result = updateDevice({
      ids: "456",
      macroVariation: "create",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: macro variations only available on rack devices",
    );
    expect(nonRackDevice.call).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "456" });
  });

  it("should reject out-of-range variation index", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "load",
      macroVariationIndex: 5,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: variation index 5 out of range (3 available)",
    );
    expect(rackDevice.set).not.toHaveBeenCalledWith(
      "selected_variation_index",
      expect.anything(),
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should call store_variation for 'create'", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "create",
    });

    expect(rackDevice.call).toHaveBeenCalledWith("store_variation");
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should call recall_selected_variation for 'load'", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "load",
      macroVariationIndex: 1,
    });

    expect(rackDevice.call).toHaveBeenCalledWith("recall_selected_variation");
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should call recall_last_used_variation for 'revert'", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "revert",
    });

    expect(rackDevice.call).toHaveBeenCalledWith("recall_last_used_variation");
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should call delete_selected_variation for 'delete'", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "delete",
      macroVariationIndex: 1,
    });

    expect(rackDevice.call).toHaveBeenCalledWith("delete_selected_variation");
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should call randomize_macros for 'randomize'", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "randomize",
    });

    expect(rackDevice.call).toHaveBeenCalledWith("randomize_macros");
    expect(result).toStrictEqual({ id: "123" });
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
      ids: "123",
      macroVariationIndex: 0,
      macroVariation: "load",
    });

    expect(callOrder).toStrictEqual(["set", "call"]);
    expect(rackDevice.set).toHaveBeenCalledWith("selected_variation_index", 0);
    expect(rackDevice.call).toHaveBeenCalledWith("recall_selected_variation");
  });

  it("should warn and ignore when macroVariationIndex provided alone", () => {
    const result = updateDevice({
      ids: "123",
      macroVariationIndex: 2,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: macroVariationIndex requires macroVariation 'load' or 'delete'",
    );
    expect(rackDevice.set).not.toHaveBeenCalledWith(
      "selected_variation_index",
      expect.anything(),
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn and skip when 'load' provided without index", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "load",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: macroVariation 'load' requires macroVariationIndex",
    );
    expect(rackDevice.call).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn and skip when 'delete' provided without index", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "delete",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: macroVariation 'delete' requires macroVariationIndex",
    );
    expect(rackDevice.call).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn but still create when 'create' provided with index", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "create",
      macroVariationIndex: 1,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: macroVariationIndex ignored for 'create' (variations always appended)",
    );
    expect(rackDevice.call).toHaveBeenCalledWith("store_variation");
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn but still revert when 'revert' provided with index", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "revert",
      macroVariationIndex: 1,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: macroVariationIndex ignored for 'revert'",
    );
    expect(rackDevice.call).toHaveBeenCalledWith("recall_last_used_variation");
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should warn but still randomize when 'randomize' provided with index", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "randomize",
      macroVariationIndex: 1,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: macroVariationIndex ignored for 'randomize'",
    );
    expect(rackDevice.call).toHaveBeenCalledWith("randomize_macros");
    expect(result).toStrictEqual({ id: "123" });
  });
});
