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

describe("updateDevice - Chain and DrumPad support", () => {
  let chain: MockObjectHandle;
  let drumChain: MockObjectHandle;
  let drumPad: MockObjectHandle;

  beforeEach(() => {
    registerMockObject("123", { type: "RackDevice" });
    chain = registerMockObject("456", { type: "Chain" });
    drumChain = registerMockObject("789", { type: "DrumChain" });
    drumPad = registerMockObject("790", { type: "DrumPad" });
    registerMockObject("791", { type: "Track" });
  });

  describe("mute and solo", () => {
    it("should set mute on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        mute: true,
      });

      expect(chain.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set solo on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        solo: true,
      });

      expect(chain.set).toHaveBeenCalledWith("solo", 1);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set mute on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        mute: true,
      });

      expect(drumChain.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should set mute on a DrumPad", () => {
      const result = updateDevice({
        ids: "790",
        mute: true,
      });

      expect(drumPad.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "790" });
    });

    it("should set mute to false (unmute)", () => {
      const result = updateDevice({
        ids: "456",
        mute: false,
      });

      expect(chain.set).toHaveBeenCalledWith("mute", 0);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should warn when mute is used on a Device", () => {
      const result = updateDevice({
        ids: "123",
        mute: true,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'mute' not applicable to RackDevice",
      );
      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("color", () => {
    it("should set color on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        color: "#3B82F6",
      });

      // setColor converts #3B82F6 to (0x3B << 16) | (0x82 << 8) | 0xF6 = 3900150
      expect(chain.set).toHaveBeenCalledWith("color", 3900150);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set color on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        color: "#FF0000",
      });

      // setColor converts #FF0000 to (0xFF << 16) | (0x00 << 8) | 0x00 = 16711680
      expect(drumChain.set).toHaveBeenCalledWith("color", 16711680);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when color is used on a DrumPad", () => {
      const result = updateDevice({
        ids: "790",
        color: "#FF0000",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'color' not applicable to DrumPad",
      );
      expect(result).toStrictEqual({ id: "790" });
    });

    it("should warn when color is used on a Device", () => {
      const result = updateDevice({
        ids: "123",
        color: "#FF0000",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'color' not applicable to RackDevice",
      );
      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("chokeGroup (DrumChain only)", () => {
    it("should set chokeGroup on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        chokeGroup: 1,
      });

      expect(drumChain.set).toHaveBeenCalledWith("choke_group", 1);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when chokeGroup is used on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        chokeGroup: 1,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'chokeGroup' not applicable to Chain",
      );
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should warn when chokeGroup is used on a Device", () => {
      const result = updateDevice({
        ids: "123",
        chokeGroup: 1,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'chokeGroup' not applicable to RackDevice",
      );
      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("mappedPitch (DrumChain only)", () => {
    it("should set mappedPitch on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        mappedPitch: "C3",
      });

      expect(drumChain.set).toHaveBeenCalledWith("out_note", 60);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should handle sharp notes for mappedPitch", () => {
      updateDevice({
        ids: "789",
        mappedPitch: "F#2",
      });

      expect(drumChain.set).toHaveBeenCalledWith("out_note", 54);
    });

    it("should warn for invalid note name in mappedPitch", () => {
      const result = updateDevice({
        ids: "789",
        mappedPitch: "InvalidNote",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        'updateDevice: invalid note name "InvalidNote"',
      );
      expect(drumChain.set).not.toHaveBeenCalledWith(
        "out_note",
        expect.anything(),
      );
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when mappedPitch is used on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        mappedPitch: "C3",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'mappedPitch' not applicable to Chain",
      );
      expect(result).toStrictEqual({ id: "456" });
    });
  });

  describe("device-only properties on non-devices", () => {
    it("should warn when collapsed is used on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        collapsed: true,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'collapsed' not applicable to Chain",
      );
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should warn when params is used on a DrumPad", () => {
      const result = updateDevice({
        ids: "790",
        params: '{"789": 0.5}',
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'params' not applicable to DrumPad",
      );
      expect(result).toStrictEqual({ id: "790" });
    });
  });

  describe("invalid types", () => {
    it("should warn and skip for Track type", () => {
      // Should not throw, just warn and return empty array (no valid targets)
      const result = updateDevice({
        ids: "791",
        name: "Test",
      });

      expect(result).toStrictEqual([]);
    });
  });

  describe("name on all types", () => {
    it("should set name on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        name: "My Chain",
      });

      expect(chain.set).toHaveBeenCalledWith("name", "My Chain");
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set name on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        name: "Kick",
      });

      expect(drumChain.set).toHaveBeenCalledWith("name", "Kick");
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when name is used on a DrumPad (read-only)", () => {
      const result = updateDevice({
        ids: "790",
        name: "Hi-Hat",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'name' is read-only for DrumPad",
      );
      expect(drumPad.set).not.toHaveBeenCalledWith("name", expect.anything());
      expect(result).toStrictEqual({ id: "790" });
    });
  });
});
