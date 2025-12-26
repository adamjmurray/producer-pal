import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
} from "../../../test/mock-live-api.js";
import { updateDevice } from "./update-device.js";
import "../../../live-api-adapter/live-api-extensions.js";

describe("updateDevice - macroVariation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id 456":
          return "456";
        default:
          return "0";
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "live_set tracks 0 devices 0";
        case "id 456":
          return "live_set tracks 0 devices 1";
        default:
          return this._path;
      }
    });

    // Default: rack device with 3 variations, variation 1 selected
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id 123") {
        if (prop === "can_have_chains") return [1];
        if (prop === "variation_count") return [3];
        if (prop === "selected_variation_index") return [1];
      }
      // Non-rack device (id 456)
      if (this._path === "id 456") {
        if (prop === "can_have_chains") return [0];
      }
      return [0];
    });
  });

  it("should reject non-rack devices with error", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = updateDevice({
      ids: "456",
      macroVariation: "create",
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "updateDevice: macro variations only available on rack devices",
    );
    expect(liveApiCall).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "456" });

    consoleSpy.mockRestore();
  });

  it("should reject out-of-range variation index", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = updateDevice({
      ids: "123",
      macroVariation: "load",
      macroVariationIndex: 5,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "updateDevice: variation index 5 out of range (3 available)",
    );
    expect(liveApiSet).not.toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 123" }),
      "selected_variation_index",
      expect.anything(),
    );
    expect(result).toEqual({ id: "123" });

    consoleSpy.mockRestore();
  });

  it("should call store_variation for 'create'", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "create",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 123" }),
      "store_variation",
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should call recall_selected_variation for 'load'", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "load",
      macroVariationIndex: 1,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 123" }),
      "recall_selected_variation",
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should call recall_last_used_variation for 'revert'", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "revert",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 123" }),
      "recall_last_used_variation",
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should call delete_selected_variation for 'delete'", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "delete",
      macroVariationIndex: 1,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 123" }),
      "delete_selected_variation",
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should call randomize_macros for 'randomize'", () => {
    const result = updateDevice({
      ids: "123",
      macroVariation: "randomize",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 123" }),
      "randomize_macros",
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should set index before executing action for 'load'", () => {
    const callOrder = [];

    liveApiSet.mockImplementation(function (prop) {
      callOrder.push({ method: "set", path: this._path, prop });
    });

    liveApiCall.mockImplementation(function (method) {
      callOrder.push({ method: "call", path: this._path, fn: method });
    });

    updateDevice({
      ids: "123",
      macroVariationIndex: 0,
      macroVariation: "load",
    });

    expect(callOrder).toEqual([
      { method: "set", path: "id 123", prop: "selected_variation_index" },
      { method: "call", path: "id 123", fn: "recall_selected_variation" },
    ]);
  });

  it("should warn and ignore when macroVariationIndex provided alone", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = updateDevice({
      ids: "123",
      macroVariationIndex: 2,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "updateDevice: macroVariationIndex requires macroVariation 'load' or 'delete'",
    );
    expect(liveApiSet).not.toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 123" }),
      "selected_variation_index",
      expect.anything(),
    );
    expect(result).toEqual({ id: "123" });

    consoleSpy.mockRestore();
  });

  it("should warn and skip when 'load' provided without index", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = updateDevice({
      ids: "123",
      macroVariation: "load",
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "updateDevice: macroVariation 'load' requires macroVariationIndex",
    );
    expect(liveApiCall).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "123" });

    consoleSpy.mockRestore();
  });

  it("should warn and skip when 'delete' provided without index", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = updateDevice({
      ids: "123",
      macroVariation: "delete",
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "updateDevice: macroVariation 'delete' requires macroVariationIndex",
    );
    expect(liveApiCall).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "123" });

    consoleSpy.mockRestore();
  });

  it("should warn but still create when 'create' provided with index", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = updateDevice({
      ids: "123",
      macroVariation: "create",
      macroVariationIndex: 1,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "updateDevice: macroVariationIndex ignored for 'create' (variations always appended)",
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 123" }),
      "store_variation",
    );
    expect(result).toEqual({ id: "123" });

    consoleSpy.mockRestore();
  });

  it("should warn but still revert when 'revert' provided with index", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = updateDevice({
      ids: "123",
      macroVariation: "revert",
      macroVariationIndex: 1,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "updateDevice: macroVariationIndex ignored for 'revert'",
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 123" }),
      "recall_last_used_variation",
    );
    expect(result).toEqual({ id: "123" });

    consoleSpy.mockRestore();
  });

  it("should warn but still randomize when 'randomize' provided with index", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = updateDevice({
      ids: "123",
      macroVariation: "randomize",
      macroVariationIndex: 1,
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "updateDevice: macroVariationIndex ignored for 'randomize'",
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 123" }),
      "randomize_macros",
    );
    expect(result).toEqual({ id: "123" });

    consoleSpy.mockRestore();
  });
});
