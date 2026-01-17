import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiSet, liveApiType } from "#src/test/mock-live-api.js";
import { updateDevice } from "./update-device.js";
import "#src/live-api-adapter/live-api-extensions.js";

describe("updateDevice - Chain and DrumPad support", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    liveApiType.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "RackDevice";
        case "id 456":
          return "Chain";
        case "id 789":
          return "DrumChain";
        case "id 790":
          return "DrumPad";
        case "id 791":
          return "Track"; // Invalid type
        default:
          return "Device";
      }
    });
  });

  describe("mute and solo", () => {
    it("should set mute on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        mute: true,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 456" }),
        "mute",
        1,
      );
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set solo on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        solo: true,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 456" }),
        "solo",
        1,
      );
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set mute on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        mute: true,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "mute",
        1,
      );
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should set mute on a DrumPad", () => {
      const result = updateDevice({
        ids: "790",
        mute: true,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 790" }),
        "mute",
        1,
      );
      expect(result).toStrictEqual({ id: "790" });
    });

    it("should set mute to false (unmute)", () => {
      const result = updateDevice({
        ids: "456",
        mute: false,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 456" }),
        "mute",
        0,
      );
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should warn when mute is used on a Device", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "123",
        mute: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: 'mute' not applicable to RackDevice",
      );
      expect(result).toStrictEqual({ id: "123" });

      consoleSpy.mockRestore();
    });
  });

  describe("color", () => {
    it("should set color on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        color: "#3B82F6",
      });

      // setColor converts #3B82F6 to (0x3B << 16) | (0x82 << 8) | 0xF6 = 3900150
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 456" }),
        "color",
        3900150,
      );
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set color on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        color: "#FF0000",
      });

      // setColor converts #FF0000 to (0xFF << 16) | (0x00 << 8) | 0x00 = 16711680
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "color",
        16711680,
      );
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when color is used on a DrumPad", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "790",
        color: "#FF0000",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: 'color' not applicable to DrumPad",
      );
      expect(result).toStrictEqual({ id: "790" });

      consoleSpy.mockRestore();
    });

    it("should warn when color is used on a Device", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: 'color' not applicable to RackDevice",
      );
      expect(result).toStrictEqual({ id: "123" });

      consoleSpy.mockRestore();
    });
  });

  describe("chokeGroup (DrumChain only)", () => {
    it("should set chokeGroup on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        chokeGroup: 1,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "choke_group",
        1,
      );
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when chokeGroup is used on a Chain", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "456",
        chokeGroup: 1,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: 'chokeGroup' not applicable to Chain",
      );
      expect(result).toStrictEqual({ id: "456" });

      consoleSpy.mockRestore();
    });

    it("should warn when chokeGroup is used on a Device", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "123",
        chokeGroup: 1,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: 'chokeGroup' not applicable to RackDevice",
      );
      expect(result).toStrictEqual({ id: "123" });

      consoleSpy.mockRestore();
    });
  });

  describe("mappedPitch (DrumChain only)", () => {
    it("should set mappedPitch on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        mappedPitch: "C3",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "out_note",
        60, // C3 = MIDI 60
      );
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should handle sharp notes for mappedPitch", () => {
      updateDevice({
        ids: "789",
        mappedPitch: "F#2",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "out_note",
        54, // F#2 = MIDI 54
      );
    });

    it("should warn for invalid note name in mappedPitch", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "789",
        mappedPitch: "InvalidNote",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'updateDevice: invalid note name "InvalidNote"',
      );
      expect(liveApiSet).not.toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "out_note",
        expect.anything(),
      );
      expect(result).toStrictEqual({ id: "789" });

      consoleSpy.mockRestore();
    });

    it("should warn when mappedPitch is used on a Chain", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "456",
        mappedPitch: "C3",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: 'mappedPitch' not applicable to Chain",
      );
      expect(result).toStrictEqual({ id: "456" });

      consoleSpy.mockRestore();
    });
  });

  describe("device-only properties on non-devices", () => {
    it("should warn when collapsed is used on a Chain", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "456",
        collapsed: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: 'collapsed' not applicable to Chain",
      );
      expect(result).toStrictEqual({ id: "456" });

      consoleSpy.mockRestore();
    });

    it("should warn when params is used on a DrumPad", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "790",
        params: '{"789": 0.5}',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: 'params' not applicable to DrumPad",
      );
      expect(result).toStrictEqual({ id: "790" });

      consoleSpy.mockRestore();
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

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 456" }),
        "name",
        "My Chain",
      );
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set name on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        name: "Kick",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "name",
        "Kick",
      );
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when name is used on a DrumPad (read-only)", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "790",
        name: "Hi-Hat",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: 'name' is read-only for DrumPad",
      );
      expect(liveApiSet).not.toHaveBeenCalledWith(
        expect.objectContaining({ _path: "id 790" }),
        "name",
        expect.anything(),
      );
      expect(result).toStrictEqual({ id: "790" });

      consoleSpy.mockRestore();
    });
  });
});
