// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import "./live-api-extensions.ts";

describe("LiveAPI extensions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  describe("getProperty", () => {
    it("should handle available_warp_modes property", () => {
      const mockClip = registerMockObject("clip1", {
        path: "live_set tracks 0 clip_slots 0 clip",
        type: "Clip",
      });

      mockClip.get.mockReturnValue(["Classic", "Beats", "Complex"]);

      const clip = LiveAPI.from("clip1");
      const warpModes = clip.getProperty("available_warp_modes");

      expect(warpModes).toStrictEqual(["Classic", "Beats", "Complex"]);
    });

    it("should handle scale_intervals property", () => {
      const mockClip = registerMockObject("clip2", {
        path: "live_set tracks 0 clip_slots 0 clip",
        type: "Clip",
      });

      mockClip.get.mockReturnValue([0, 2, 4, 5, 7, 9, 11]);

      const clip = LiveAPI.from("clip2");
      const intervals = clip.getProperty("scale_intervals");

      expect(intervals).toStrictEqual([0, 2, 4, 5, 7, 9, 11]);
    });
  });

  describe("setAll", () => {
    it("should set multiple properties at once", () => {
      const track = LiveAPI.from("live_set tracks 0");
      const setSpy = vi.spyOn(track, "set");

      track.setAll({
        name: "My Track",
        volume: 0.8,
        panning: -0.5,
      });

      expect(setSpy).toHaveBeenCalledWith("name", "My Track");
      expect(setSpy).toHaveBeenCalledWith("volume", 0.8);
      expect(setSpy).toHaveBeenCalledWith("panning", -0.5);
    });

    it("should skip null values", () => {
      const track = LiveAPI.from("live_set tracks 0");
      const setSpy = vi.spyOn(track, "set");

      track.setAll({
        name: "My Track",
        volume: null,
        panning: -0.5,
      });

      expect(setSpy).toHaveBeenCalledWith("name", "My Track");
      expect(setSpy).not.toHaveBeenCalledWith("volume", null);
      expect(setSpy).toHaveBeenCalledWith("panning", -0.5);
    });

    it("should handle color property with setColor", () => {
      const track = LiveAPI.from("live_set tracks 0");
      const setColorSpy = vi.spyOn(track, "setColor");
      const setSpy = vi.spyOn(track, "set");

      track.setAll({
        name: "My Track",
        color: "#FF0000",
      });

      expect(setColorSpy).toHaveBeenCalledWith("#FF0000");
      expect(setSpy).toHaveBeenCalledWith("name", "My Track");
    });
  });

  describe("clipSlotIndex property", () => {
    it("should extract clip slot index from clip_slots path", () => {
      const clipSlot = LiveAPI.from("live_set tracks 2 clip_slots 5");

      expect(clipSlot.clipSlotIndex).toBe(5);
    });

    it("should extract clip slot index from scenes path", () => {
      const scene = LiveAPI.from("live_set scenes 3");

      expect(scene.clipSlotIndex).toBe(3);
    });

    it("should return null for non-clip-slot paths", () => {
      const track = LiveAPI.from("live_set tracks 0");

      expect(track.clipSlotIndex).toBeNull();
    });
  });

  describe("deviceIndex property", () => {
    it("should extract device index from devices path", () => {
      const device = LiveAPI.from("live_set tracks 0 devices 2");

      expect(device.deviceIndex).toBe(2);
    });

    it("should extract last device index from nested devices path", () => {
      const device = LiveAPI.from(
        "live_set tracks 0 devices 1 chains 0 devices 3",
      );

      expect(device.deviceIndex).toBe(3);
    });

    it("should return null for paths without devices", () => {
      const track = LiveAPI.from("live_set tracks 0");

      expect(track.deviceIndex).toBeNull();
    });
  });

  describe("routing properties", () => {
    it("should handle input_routing_channel property", () => {
      const mockTrack = registerMockObject("track1", {
        path: "live_set tracks 0",
        type: "Track",
      });

      mockTrack.get.mockReturnValue([
        JSON.stringify({ input_routing_channel: { display_name: "1/2" } }),
      ]);

      const track = LiveAPI.from("track1");
      const channel = track.getProperty("input_routing_channel");

      expect(channel).toStrictEqual({ display_name: "1/2" });
    });

    it("should return null for routing property with null raw value", () => {
      const mockTrack = registerMockObject("track2", {
        path: "live_set tracks 0",
        type: "Track",
      });

      mockTrack.get.mockReturnValue([null]);

      const track = LiveAPI.from("track2");
      const channel = track.getProperty("input_routing_channel");

      expect(channel).toBeNull();
    });

    it("should return null for routing property with invalid JSON", () => {
      const mockTrack = registerMockObject("track3", {
        path: "live_set tracks 0",
        type: "Track",
      });

      mockTrack.get.mockReturnValue(["invalid json {"]);

      const track = LiveAPI.from("track3");
      const channel = track.getProperty("input_routing_channel");

      expect(channel).toBeNull();
    });
  });
});
