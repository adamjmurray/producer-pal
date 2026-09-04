// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  mockNonExistentObjects,
  mockWorkingDeviceMoves,
  registerMockObject,
  registerParamMock,
  updateDevice,
} from "./update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateDevice", () => {
  let device123: RegisteredMockObject;
  let device456: RegisteredMockObject;

  beforeEach(() => {
    device123 = registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
    });

    device456 = registerMockObject("456", {
      path: livePath.track(0).device(1),
      type: "Device",
    });

    // Default param objects
    registerParamMock("789", 0);
    registerParamMock("790", 1);
  });

  it("should update a single device name", () => {
    const result = updateDevice({
      id: "123",
      name: "My Device",
    });

    expect(device123.set).toHaveBeenCalledWith("name", "My Device");
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  // collapsed — kept for potential future use (tests removed)

  it("should update multiple devices", () => {
    const result = updateDevice({
      id: "123, 456",
      name: "Same Name",
    });

    expect(device123.set).toHaveBeenCalledWith("name", "Same Name");
    expect(device456.set).toHaveBeenCalledWith("name", "Same Name");
    expect(result).toStrictEqual([
      { id: "123", path: "t0/d0" },
      { id: "456", path: "t0/d1" },
    ]);
  });

  it("should skip non-existent devices with warning", () => {
    mockNonExistentObjects();

    const result = updateDevice({
      id: "123, 999, 456",
      name: "Test",
    });

    expect(capturedWarnings()).toContain(
      'updateDevice: target not found at id "999"',
    );
    expect(result).toStrictEqual([
      { id: "123", path: "t0/d0" },
      { id: "456", path: "t0/d1" },
    ]);
  });

  it("should return empty array when all devices are invalid", () => {
    mockNonExistentObjects();

    const result = updateDevice({
      id: "998, 999",
      name: "Test",
    });

    expect(result).toStrictEqual([]);
  });

  it("should handle 'id ' prefixed device IDs", () => {
    const result = updateDevice({
      id: "id 123",
      name: "Prefixed ID",
    });

    expect(device123.set).toHaveBeenCalledWith("name", "Prefixed ID");
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  it("should not call set when no properties provided", () => {
    const result = updateDevice({
      id: "123",
    });

    expect(device123.set).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
  });

  describe("params - numeric values", () => {
    let param789: RegisteredMockObject;
    let param790: RegisteredMockObject;

    beforeEach(() => {
      param789 = registerParamMock("789", 0);
      param790 = registerParamMock("790", 1);
    });

    it("should set value for numeric params", () => {
      const result = updateDevice({
        id: "123",
        params: [{ name: "789", value: "0.8" }],
      });

      expect(param789.set).toHaveBeenCalledWith("value", 0.8);
      // The value comes back read from the param, so a param that snapped to a
      // different step would report the step, not what was asked for.
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/d0",
        params: [{ id: "789", name: "Param 789", value: 0.8 }],
      });
    });

    it("should set multiple param values", () => {
      const result = updateDevice({
        id: "123",
        params: [
          { name: "789", value: "0.3" },
          { name: "790", value: "0.7" },
        ],
      });

      expect(param789.set).toHaveBeenCalledWith("value", 0.3);
      expect(param790.set).toHaveBeenCalledWith("value", 0.7);
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/d0",
        params: [
          { id: "789", name: "Param 789", value: 0.3 },
          { id: "790", name: "Param 790", value: 0.7 },
        ],
      });
    });

    it("should log error for invalid param ID but continue", () => {
      mockNonExistentObjects();

      const result = updateDevice({
        id: "123",
        params: [{ name: "999", value: "0.5" }],
      });

      expect(capturedWarnings()).toContain(
        'updateDevice: param "999" not found on t0/d0 (id 123)',
      );
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    // A hole in the params list, the same shape a hole in a comma-separated
    // list is already refused for. Nothing has been written yet, so the caller
    // fixes the list and sends it again.
    it("should refuse an entry with an empty name", () => {
      expect(() =>
        updateDevice({ id: "123", params: [{ name: "  ", value: "0.5" }] }),
      ).toThrow("updateDevice failed: params entry 1 has an empty name");
    });

    it("should refuse an entry with an empty value", () => {
      expect(() =>
        updateDevice({ id: "123", params: [{ name: "789", value: "  " }] }),
      ).toThrow('updateDevice failed: params entry "789" has an empty value');
    });
  });

  describe("params - enum values", () => {
    let param791: RegisteredMockObject;

    beforeEach(() => {
      param791 = registerMockObject("791", {
        path: livePath.track(0).device(0).parameter(1),
        type: "DeviceParameter",
        properties: {
          name: "Warp Mode",
          original_name: "Warp Mode",
          is_quantized: 1,
          value_items: ["Repitch", "Fade", "Jump"],
        },
      });
    });

    it("should convert string value to index for quantized param", () => {
      const result = updateDevice({
        id: "123",
        params: [{ name: "791", value: "Fade" }],
      });

      expect(param791.set).toHaveBeenCalledWith("value", 1);
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/d0",
        params: [{ id: "791", name: "Warp Mode", value: "Fade" }],
      });
    });

    it("should log error for invalid enum value", () => {
      const result = updateDevice({
        id: "123",
        params: [{ name: "791", value: "InvalidValue" }],
      });

      expect(capturedWarnings()).toContain(
        'updateDevice: t0/d0 (id 123) param "Warp Mode" (id 791): "InvalidValue" is not valid. ' +
          "Options: Repitch, Fade, Jump",
      );
      expect(param791.set).not.toHaveBeenCalledWith("value", expect.anything());
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("resolves a numeric-looking label to its index (M3: no binary-search bypass)", () => {
      // A quantized selector whose labels are numbers (e.g. a "1"/"2"/"4"/"8"
      // retrigger/sync selector). normalizeParamValue turns the input "4" into
      // the number 4, which used to skip the enum branch and binary-search a
      // garbage raw value (2.9999… instead of index 2). It must resolve to the
      // index of the "4" label.
      const numericLabelParam = registerMockObject("793", {
        path: livePath.track(0).device(0).parameter(2),
        type: "DeviceParameter",
        properties: {
          name: "Retrigger",
          original_name: "Retrigger",
          is_quantized: 1,
          value_items: ["1", "2", "4", "8"],
        },
      });

      const result = updateDevice({
        id: "123",
        params: [{ name: "793", value: "4" }],
      });

      expect(numericLabelParam.set).toHaveBeenCalledWith("value", 2);
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/d0",
        params: [{ id: "793", name: "Retrigger", value: "4" }],
      });
    });

    it("warns when a numeric input matches no quantized label", () => {
      // A bare index that isn't a label (value_items are words) must warn with
      // the options, not silently binary-search a garbage raw value.
      const result = updateDevice({
        id: "123",
        params: [{ name: "791", value: "1" }],
      });

      expect(capturedWarnings()).toContain(
        'updateDevice: t0/d0 (id 123) param "Warp Mode" (id 791): "1" is not valid. ' +
          "Options: Repitch, Fade, Jump",
      );
      expect(param791.set).not.toHaveBeenCalledWith("value", expect.anything());
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });
  });

  describe("params - note values", () => {
    let param789: RegisteredMockObject;

    beforeEach(() => {
      param789 = registerParamMock("789", 0);
    });

    it("should convert note name to MIDI number (Live convention: C3=60)", () => {
      const result = updateDevice({
        id: "123",
        params: [{ name: "789", value: "C3" }],
      });

      expect(param789.set).toHaveBeenCalledWith("value", 60);
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/d0",
        params: [{ id: "789", name: "Param 789", value: 60 }],
      });
    });

    it("should handle sharps and flats", () => {
      updateDevice({
        id: "123",
        params: [{ name: "789", value: "F#-1" }],
      });

      expect(param789.set).toHaveBeenCalledWith("value", 18);
    });
  });

  describe("params - pan values", () => {
    let param792: RegisteredMockObject;

    beforeEach(() => {
      param792 = registerMockObject("792", {
        path: livePath.track(0).device(0).parameter(3),
        type: "DeviceParameter",
        properties: {
          name: "Pan",
          original_name: "Pan",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: { str_for_value: () => "C" },
      });
    });

    it("should convert -1 to 1 range to internal range for pan", () => {
      const result = updateDevice({
        id: "123",
        params: [{ name: "792", value: "-0.5" }],
      });

      // -0.5 → internal: ((-0.5 + 1) / 2) * (1 - 0) + 0 = 0.25
      expect(param792.set).toHaveBeenCalledWith("value", 0.25);
      // The mock always reads back "C", so the reported value is center.
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/d0",
        params: [{ id: "792", name: "Pan", value: 0 }],
      });
    });

    it("should handle full left pan", () => {
      updateDevice({
        id: "123",
        params: [{ name: "792", value: "-1" }],
      });

      // -1 → internal: 0
      expect(param792.set).toHaveBeenCalledWith("value", 0);
    });

    it("should handle full right pan", () => {
      updateDevice({
        id: "123",
        params: [{ name: "792", value: "1" }],
      });

      // 1 → internal: 1
      expect(param792.set).toHaveBeenCalledWith("value", 1);
    });

    it("maps directional pan display labels (50L/50R/25L) back to -1..1", () => {
      // Regression (#14): a directional label like "50L" was reduced to the bare
      // number 50 by normalizeParamValue (dropping the L), then mapped to a
      // clamped full-RIGHT value. Each must parse back to its signed -1..1
      // position via the param's own display max.
      const panDir = registerMockObject("793", {
        path: livePath.track(0).device(0).parameter(4),
        type: "DeviceParameter",
        properties: { is_quantized: 0, value: 0, min: -1, max: 1 },
        methods: {
          str_for_value: (v: unknown) =>
            v === -1 ? "50L" : v === 1 ? "50R" : "C",
        },
      });

      updateDevice({ id: "123", params: [{ name: "793", value: "50L" }] });
      expect(panDir.set).toHaveBeenCalledWith("value", -1); // full left

      updateDevice({ id: "123", params: [{ name: "793", value: "50R" }] });
      expect(panDir.set).toHaveBeenCalledWith("value", 1); // full right

      updateDevice({ id: "123", params: [{ name: "793", value: "25L" }] });
      expect(panDir.set).toHaveBeenCalledWith("value", -0.5); // half left
    });

    it("warns and skips a non-pan string instead of writing NaN", () => {
      updateDevice({
        id: "123",
        params: [{ name: "792", value: "hard-left" }],
      });

      expect(capturedWarnings()).toContain(
        'updateDevice: t0/d0 (id 123) param "Pan" (id 792): "hard-left" is not a valid pan ' +
          'value (use -1 to 1, or "50L"/"50R"/"C")',
      );
      expect(param792.set).not.toHaveBeenCalled();
    });
  });

  // Params by name are in params/update-device-param-names.test.ts
  // Division params tests are in update-device-division-params.test.js
  // macroVariation tests are in update-device-macro-variation.test.js
  // Chain and DrumPad tests are in update-device-chains.test.js

  describe("macroCount", () => {
    beforeEach(() => {
      // id 123 is a RackDevice (supports macroCount), id 456 is a regular Device
      device123 = registerMockObject("123", {
        path: livePath.track(0).device(0),
        type: "RackDevice",
        properties: { can_have_chains: 1, visible_macro_count: 4 },
      });

      device456 = registerMockObject("456", {
        path: livePath.track(0).device(1),
        type: "Device",
        properties: { can_have_chains: 0 },
      });
    });

    it("should reject non-rack devices with error", () => {
      const result = updateDevice({
        id: "456",
        macroCount: 8,
      });

      expect(capturedWarnings()).toContain(
        "updateDevice: 'macroCount' not applicable to Device t0/d1 (id 456)",
      );
      expect(device456.call).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ id: "456", path: "t0/d1" });
    });

    it("should call add_macro when increasing count (macros added in pairs)", () => {
      const result = updateDevice({
        id: "123",
        macroCount: 8, // 4 -> 8 = diff of 4 = 2 pairs
      });

      expect(device123.call).toHaveBeenCalledTimes(2);
      expect(device123.call).toHaveBeenCalledWith("add_macro");
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should call remove_macro when decreasing count (macros removed in pairs)", () => {
      const result = updateDevice({
        id: "123",
        macroCount: 0, // 4 -> 0 = diff of 4 = 2 pairs
      });

      expect(device123.call).toHaveBeenCalledTimes(2);
      expect(device123.call).toHaveBeenCalledWith("remove_macro");
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should do nothing when count matches", () => {
      const result = updateDevice({
        id: "123",
        macroCount: 4, // 4 -> 4 = no change
      });

      expect(device123.call).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should round odd counts up to next even and warn", () => {
      const result = updateDevice({
        id: "123",
        macroCount: 7, // rounds to 8, 4 -> 8 = 2 pairs
      });

      expect(capturedWarnings()).toContain(
        "updateDevice: macro count on t0/d0 (id 123) rounded from 7 to 8 (macros come in pairs)",
      );
      expect(device123.call).toHaveBeenCalledTimes(2);
      expect(device123.call).toHaveBeenCalledWith("add_macro");
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });
  });

  describe("abCompare", () => {
    beforeEach(() => {
      device123 = registerMockObject("123", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { can_compare_ab: 1 },
      });

      device456 = registerMockObject("456", {
        path: livePath.track(0).device(1),
        type: "Device",
        properties: { can_compare_ab: 0 },
      });
    });

    it("should reject devices without AB Compare support", () => {
      const result = updateDevice({
        id: "456",
        abCompare: "b",
      });

      expect(capturedWarnings()).toContain(
        "updateDevice: A/B Compare not available on t0/d1 (id 456)",
      );
      expect(device456.set).not.toHaveBeenCalled();
      expect(device456.call).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ id: "456", path: "t0/d1" });
    });

    it("should set is_using_compare_preset_b to 0 for 'a'", () => {
      const result = updateDevice({
        id: "123",
        abCompare: "a",
      });

      expect(device123.set).toHaveBeenCalledWith(
        "is_using_compare_preset_b",
        0,
      );
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should set is_using_compare_preset_b to 1 for 'b'", () => {
      const result = updateDevice({
        id: "123",
        abCompare: "b",
      });

      expect(device123.set).toHaveBeenCalledWith(
        "is_using_compare_preset_b",
        1,
      );
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should call save_preset_to_compare_ab_slot for 'save'", () => {
      const result = updateDevice({
        id: "123",
        abCompare: "save",
      });

      expect(device123.call).toHaveBeenCalledWith(
        "save_preset_to_compare_ab_slot",
      );
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });
  });

  describe("toPath - device moving", () => {
    let liveSet: RegisteredMockObject;

    beforeEach(() => {
      liveSet = mockWorkingDeviceMoves();

      registerMockObject("track1", { path: livePath.track(1) });
      registerMockObject("track0", { path: livePath.track(0) });
      registerMockObject("device0", {
        path: livePath.track(0).device(0),
        properties: {
          chains: children("chain-0", "chain-1"),
          can_have_drum_pads: 0,
        },
      });
      registerMockObject("chain1", {
        path: livePath.track(0).device(0).chain(1),
      });
    });

    it("should move device to a different track", () => {
      const result = updateDevice({
        id: "123",
        toPath: "t1",
      });

      // move_device takes "id X" format for live object parameters
      expect(liveSet.call).toHaveBeenCalledWith(
        "move_device",
        "id 123",
        "id track1",
        0,
      );
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should move device to a specific position", () => {
      const result = updateDevice({
        id: "123",
        toPath: "t1/d2",
      });

      expect(liveSet.call).toHaveBeenCalledWith(
        "move_device",
        "id 123",
        "id track1",
        2,
      );
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should move device into a rack chain", () => {
      const result = updateDevice({
        id: "123",
        toPath: "t0/d0/c1",
      });

      expect(liveSet.call).toHaveBeenCalledWith(
        "move_device",
        "id 123",
        "id chain1",
        0,
      );
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should warn and skip when trying to move a Chain", () => {
      registerMockObject("123", { type: "Chain" });

      // Should not throw, just warn and continue with other updates
      const result = updateDevice({
        id: "123",
        toPath: "t1",
      });

      // A plain Chain is neither a device nor a DrumChain: it cannot be moved.
      expect(capturedWarnings()).toContain(
        "updateDevice: cannot move Chain t0/d0 (id 123)",
      );
      expect(liveSet.call).not.toHaveBeenCalledWith(
        "move_device",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should warn and skip when trying to move a rack Chain", () => {
      // Not a DrumPad: a pad id names the whole pad now, and a pad move is an
      // in_note re-map that updateDrumPadGroup handles.
      registerMockObject("123", { type: "Chain" });

      // Should not throw, just warn and continue with other updates
      const result = updateDevice({
        id: "123",
        toPath: "t1",
      });

      expect(capturedWarnings()).toContain(
        "updateDevice: cannot move Chain t0/d0 (id 123)",
      );
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should warn and skip when target path does not exist", () => {
      mockNonExistentObjects();

      // Should not throw, just warn and continue with other updates
      const result = updateDevice({
        id: "123",
        toPath: "t99",
      });

      // The missing container is reported and no move is attempted.
      expect(capturedWarnings()).toContain(
        'move target at path "t99" does not exist',
      );
      expect(liveSet.call).not.toHaveBeenCalledWith(
        "move_device",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });

    it("should allow combining move with other updates", () => {
      const result = updateDevice({
        id: "123",
        toPath: "t1",
        name: "Moved Device",
      });

      // Should call move_device with "id X" format
      expect(liveSet.call).toHaveBeenCalledWith(
        "move_device",
        "id 123",
        "id track1",
        0,
      );

      // Should also set name
      expect(device123.set).toHaveBeenCalledWith("name", "Moved Device");

      expect(result).toStrictEqual({ id: "123", path: "t0/d0" });
    });
  });

  describe("type validation", () => {
    it("should warn and skip an object that is not a device, chain, or pad", () => {
      registerMockObject("999", {
        path: livePath.track(3),
        type: "Track",
      });

      const result = updateDevice({ id: "999", name: "Nope" });

      expect(capturedWarnings()).toContain(
        "updateDevice: cannot update Track objects: t3 (id 999)",
      );
      // Nothing is written to an unsupported object, and it drops from results.
      expect(result).toStrictEqual([]);
    });
  });

  // Move tests are in update-device-move.test.ts
});
