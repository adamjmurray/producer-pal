// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/test/helpers/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "./update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateDevice", () => {
  let device123: RegisteredMockObject;
  let device456: RegisteredMockObject;
  let view123: RegisteredMockObject;

  beforeEach(() => {
    device123 = registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
    });

    device456 = registerMockObject("456", {
      path: livePath.track(0).device(1),
      type: "Device",
    });

    // Views for collapsed state
    view123 = registerMockObject("view-123", {
      path: "live_set tracks 0 devices 0 view",
    });
    registerMockObject("view-456", {
      path: "live_set tracks 0 devices 1 view",
    });

    // Default param objects
    registerMockObject("789", {
      properties: { is_quantized: 0, value: 0.5, min: 0, max: 1 },
      methods: { str_for_value: (_value: unknown) => String(_value) },
    });
    registerMockObject("790", {
      properties: { is_quantized: 0, value: 0.5, min: 0, max: 1 },
      methods: { str_for_value: (_value: unknown) => String(_value) },
    });
  });

  it("should update a single device name", () => {
    const result = updateDevice({
      ids: "123",
      name: "My Device",
    });

    expect(device123.set).toHaveBeenCalledWith("name", "My Device");
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update collapsed state to true", () => {
    const result = updateDevice({
      ids: "123",
      collapsed: true,
    });

    expect(view123.set).toHaveBeenCalledWith("is_collapsed", 1);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update collapsed state to false", () => {
    const result = updateDevice({
      ids: "123",
      collapsed: false,
    });

    expect(view123.set).toHaveBeenCalledWith("is_collapsed", 0);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update both name and collapsed", () => {
    const result = updateDevice({
      ids: "123",
      name: "Collapsed Device",
      collapsed: true,
    });

    expect(device123.set).toHaveBeenCalledWith("name", "Collapsed Device");
    expect(view123.set).toHaveBeenCalledWith("is_collapsed", 1);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update multiple devices", () => {
    const result = updateDevice({
      ids: "123, 456",
      name: "Same Name",
    });

    expect(device123.set).toHaveBeenCalledWith("name", "Same Name");
    expect(device456.set).toHaveBeenCalledWith("name", "Same Name");
    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should skip non-existent devices with warning", () => {
    mockNonExistentObjects();

    const result = updateDevice({
      ids: "123, 999, 456",
      name: "Test",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateDevice: target not found at id "999"',
    );
    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should return empty array when all devices are invalid", () => {
    mockNonExistentObjects();

    const result = updateDevice({
      ids: "998, 999",
      name: "Test",
    });

    expect(result).toStrictEqual([]);
  });

  it("should handle 'id ' prefixed device IDs", () => {
    const result = updateDevice({
      ids: "id 123",
      name: "Prefixed ID",
    });

    expect(device123.set).toHaveBeenCalledWith("name", "Prefixed ID");
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should not call set when no properties provided", () => {
    const result = updateDevice({
      ids: "123",
    });

    expect(device123.set).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "123" });
  });

  describe("params - numeric values", () => {
    let param789: RegisteredMockObject;
    let param790: RegisteredMockObject;

    beforeEach(() => {
      param789 = registerMockObject("789", {
        properties: { is_quantized: 0, value: 0.5, min: 0, max: 1 },
        methods: { str_for_value: (_value: unknown) => String(_value) },
      });
      param790 = registerMockObject("790", {
        properties: { is_quantized: 0, value: 0.5, min: 0, max: 1 },
        methods: { str_for_value: (_value: unknown) => String(_value) },
      });
    });

    it("should set display_value for numeric params", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"789": 1000}',
      });

      expect(param789.set).toHaveBeenCalledWith("display_value", 1000);
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should set multiple param values", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"789": 500, "790": 1000}',
      });

      expect(param789.set).toHaveBeenCalledWith("display_value", 500);
      expect(param790.set).toHaveBeenCalledWith("display_value", 1000);
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should log error for invalid param ID but continue", () => {
      mockNonExistentObjects();

      const result = updateDevice({
        ids: "123",
        params: '{"999": 0.5}',
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        'updateDevice: param "999" not found on device',
      );
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should throw error for invalid JSON in params", () => {
      expect(() =>
        updateDevice({
          ids: "123",
          params: "not valid json",
        }),
      ).toThrow();
    });
  });

  describe("params - enum values", () => {
    let param791: RegisteredMockObject;

    beforeEach(() => {
      param791 = registerMockObject("791", {
        properties: {
          is_quantized: 1,
          value_items: ["Repitch", "Fade", "Jump"],
        },
      });
    });

    it("should convert string value to index for quantized param", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"791": "Fade"}',
      });

      expect(param791.set).toHaveBeenCalledWith("value", 1);
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should log error for invalid enum value", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"791": "InvalidValue"}',
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        'updateDevice: "InvalidValue" is not valid. Options: Repitch, Fade, Jump',
      );
      expect(param791.set).not.toHaveBeenCalledWith("value", expect.anything());
      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("params - note values", () => {
    let param789: RegisteredMockObject;

    beforeEach(() => {
      param789 = registerMockObject("789", {
        properties: { is_quantized: 0, value: 0.5, min: 0, max: 1 },
        methods: { str_for_value: (_value: unknown) => String(_value) },
      });
    });

    it("should convert note name to MIDI number (Live convention: C3=60)", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"789": "C3"}',
      });

      expect(param789.set).toHaveBeenCalledWith("value", 60);
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should handle sharps and flats", () => {
      updateDevice({
        ids: "123",
        params: '{"789": "F#-1"}',
      });

      expect(param789.set).toHaveBeenCalledWith("value", 18);
    });
  });

  describe("params - pan values", () => {
    let param792: RegisteredMockObject;

    beforeEach(() => {
      param792 = registerMockObject("792", {
        properties: { is_quantized: 0, value: 0.5, min: 0, max: 1 },
        methods: { str_for_value: () => "C" },
      });
    });

    it("should convert -1 to 1 range to internal range for pan", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"792": -0.5}',
      });

      // -0.5 → internal: ((-0.5 + 1) / 2) * (1 - 0) + 0 = 0.25
      expect(param792.set).toHaveBeenCalledWith("value", 0.25);
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should handle full left pan", () => {
      updateDevice({
        ids: "123",
        params: '{"792": -1}',
      });

      // -1 → internal: 0
      expect(param792.set).toHaveBeenCalledWith("value", 0);
    });

    it("should handle full right pan", () => {
      updateDevice({
        ids: "123",
        params: '{"792": 1}',
      });

      // 1 → internal: 1
      expect(param792.set).toHaveBeenCalledWith("value", 1);
    });
  });

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
        ids: "456",
        macroCount: 8,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'macroCount' not applicable to Device",
      );
      expect(device456.call).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should call add_macro when increasing count (macros added in pairs)", () => {
      const result = updateDevice({
        ids: "123",
        macroCount: 8, // 4 -> 8 = diff of 4 = 2 pairs
      });

      expect(device123.call).toHaveBeenCalledTimes(2);
      expect(device123.call).toHaveBeenCalledWith("add_macro");
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should call remove_macro when decreasing count (macros removed in pairs)", () => {
      const result = updateDevice({
        ids: "123",
        macroCount: 0, // 4 -> 0 = diff of 4 = 2 pairs
      });

      expect(device123.call).toHaveBeenCalledTimes(2);
      expect(device123.call).toHaveBeenCalledWith("remove_macro");
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should do nothing when count matches", () => {
      const result = updateDevice({
        ids: "123",
        macroCount: 4, // 4 -> 4 = no change
      });

      expect(device123.call).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should round odd counts up to next even and warn", () => {
      const result = updateDevice({
        ids: "123",
        macroCount: 7, // rounds to 8, 4 -> 8 = 2 pairs
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: macro count rounded from 7 to 8 (macros come in pairs)",
      );
      expect(device123.call).toHaveBeenCalledTimes(2);
      expect(device123.call).toHaveBeenCalledWith("add_macro");
      expect(result).toStrictEqual({ id: "123" });
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
        ids: "456",
        abCompare: "b",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: A/B Compare not available on this device",
      );
      expect(device456.set).not.toHaveBeenCalled();
      expect(device456.call).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set is_using_compare_preset_b to 0 for 'a'", () => {
      const result = updateDevice({
        ids: "123",
        abCompare: "a",
      });

      expect(device123.set).toHaveBeenCalledWith(
        "is_using_compare_preset_b",
        0,
      );
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should set is_using_compare_preset_b to 1 for 'b'", () => {
      const result = updateDevice({
        ids: "123",
        abCompare: "b",
      });

      expect(device123.set).toHaveBeenCalledWith(
        "is_using_compare_preset_b",
        1,
      );
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should call save_preset_to_compare_ab_slot for 'save'", () => {
      const result = updateDevice({
        ids: "123",
        abCompare: "save",
      });

      expect(device123.call).toHaveBeenCalledWith(
        "save_preset_to_compare_ab_slot",
      );
      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("toPath - device moving", () => {
    let liveSet: RegisteredMockObject;

    beforeEach(() => {
      liveSet = registerMockObject("live-set", { path: "live_set" });

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
        path: "live_set tracks 0 devices 0 chains 1",
      });
    });

    it("should move device to a different track", () => {
      const result = updateDevice({
        ids: "123",
        toPath: "t1",
      });

      // move_device takes "id X" format for live object parameters
      expect(liveSet.call).toHaveBeenCalledWith(
        "move_device",
        "id 123",
        "id track1",
        0,
      );
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should move device to a specific position", () => {
      const result = updateDevice({
        ids: "123",
        toPath: "t1/d2",
      });

      expect(liveSet.call).toHaveBeenCalledWith(
        "move_device",
        "id 123",
        "id track1",
        2,
      );
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should move device into a rack chain", () => {
      const result = updateDevice({
        ids: "123",
        toPath: "t0/d0/c1",
      });

      expect(liveSet.call).toHaveBeenCalledWith(
        "move_device",
        "id 123",
        "id chain1",
        0,
      );
      expect(result).toStrictEqual({ id: "123" });
    });

    it("should warn and skip when trying to move a Chain", () => {
      registerMockObject("123", { type: "Chain" });

      // Should not throw, just warn and continue with other updates
      const result = updateDevice({
        ids: "123",
        toPath: "t1",
      });

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should warn and skip when trying to move a DrumPad", () => {
      registerMockObject("123", { type: "DrumPad" });

      // Should not throw, just warn and continue with other updates
      const result = updateDevice({
        ids: "123",
        toPath: "t1",
      });

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should warn and skip when target path does not exist", () => {
      mockNonExistentObjects();

      // Should not throw, just warn and continue with other updates
      const result = updateDevice({
        ids: "123",
        toPath: "t99",
      });

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should allow combining move with other updates", () => {
      const result = updateDevice({
        ids: "123",
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

      expect(result).toStrictEqual({ id: "123" });
    });
  });

  // Drum chain move tests are in update-device-drum-chain-move.test.js
});
