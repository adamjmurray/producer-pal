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
import { newTargetNotes } from "#src/tools/shared/helpers/target-notes.ts";
import { updateMacroCount } from "../helpers/rack-macro-updates.ts";
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

  // An out-of-range index aborts the whole action — not just the index-set —
  // and the variation was all the call asked, so the lone target throws.
  function expectVariationIndexRejected(index: number): void {
    expect(() =>
      updateDevice({
        id: "123",
        macroVariation: "load",
        macroVariationIndex: index,
      }),
    ).toThrow(`variation index ${index} is out of range (3 available)`);

    expect(rackDevice.set).not.toHaveBeenCalledWith(
      "selected_variation_index",
      expect.anything(),
    );
    expect(rackDevice.call).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  }

  it("refuses a device that has no macro variations", () => {
    expect(() => updateDevice({ id: "456", macroVariation: "create" })).toThrow(
      "macro variations are only available on rack devices",
    );

    expect(nonRackDevice.call).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("says so on the entry when something else landed", () => {
    const result = updateDevice({
      id: "456",
      macroVariation: "create",
      name: "Renamed",
    });

    expect(result).toStrictEqual({
      id: "456",
      path: "t0/d1",
      detail: "macro variations are only available on rack devices",
    });
    expect(capturedWarnings()).toStrictEqual([]);
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

  // The pair says nothing about any one device, so a call that can't be read
  // is refused before any target is touched (ADR-0035).
  it("refuses macroVariationIndex sent on its own", () => {
    expect(() => updateDevice({ id: "123", macroVariationIndex: 2 })).toThrow(
      "macroVariationIndex requires macroVariation 'load' or 'delete'",
    );

    expect(rackDevice.set).not.toHaveBeenCalled();
  });

  it("refuses 'load' with no index", () => {
    expect(() => updateDevice({ id: "123", macroVariation: "load" })).toThrow(
      "macroVariation 'load' requires macroVariationIndex",
    );

    expect(rackDevice.call).not.toHaveBeenCalled();
  });

  it("refuses 'delete' with no index", () => {
    expect(() => updateDevice({ id: "123", macroVariation: "delete" })).toThrow(
      "macroVariation 'delete' requires macroVariationIndex",
    );

    expect(rackDevice.call).not.toHaveBeenCalled();
  });

  it.each(["create", "revert", "randomize"])(
    "refuses an index beside '%s', which takes none",
    (action) => {
      expect(() =>
        updateDevice({
          id: "123",
          macroVariation: action,
          macroVariationIndex: 1,
        }),
      ).toThrow(
        `macroVariationIndex does nothing for macroVariation '${action}' — ` +
          "only 'load' and 'delete' take one",
      );

      expect(rackDevice.call).not.toHaveBeenCalled();
    },
  );
});
describe("updateMacroCount", () => {
  let nonRackDevice: RegisteredMockObject;

  beforeEach(() => {
    nonRackDevice = registerMockObject("non-rack", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { can_have_chains: 0 },
    });
  });

  it("should refuse when device is not a rack", () => {
    const deviceApi = LiveAPI.from(nonRackDevice.path);
    const notes = newTargetNotes();

    updateMacroCount(deviceApi, 8, notes);

    expect(notes).toStrictEqual({
      said: ["macroCount is only available on rack devices"],
      refused: ["macroCount"],
    });
    expect(nonRackDevice.call).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });
});
