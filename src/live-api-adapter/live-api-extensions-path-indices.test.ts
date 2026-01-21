/// <reference path="../types/live-api.d.ts" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import "./live-api-extensions.ts";

describe("LiveAPI extensions - path index extensions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("trackIndex", () => {
    it("should return trackIndex from valid track path", () => {
      const track = LiveAPI.from("live_set tracks 3");

      expect(track.trackIndex).toBe(3);
    });

    it("should return trackIndex from clip_slots path", () => {
      const clipSlot = LiveAPI.from("live_set tracks 5 clip_slots 2");

      expect(clipSlot.trackIndex).toBe(5);
    });

    it("should return trackIndex from nested device path", () => {
      const device = LiveAPI.from("live_set tracks 7 devices 1");

      expect(device.trackIndex).toBe(7);
    });

    it("should return null for non-track paths", () => {
      const liveSet = LiveAPI.from("live_set");

      expect(liveSet.trackIndex).toBe(null);

      const scene = LiveAPI.from("live_set scenes 2");

      expect(scene.trackIndex).toBe(null);
    });

    it("should handle track index 0", () => {
      const track = LiveAPI.from("live_set tracks 0");

      expect(track.trackIndex).toBe(0);
    });

    it("should handle double-digit track indices", () => {
      const track = LiveAPI.from("live_set tracks 42");

      expect(track.trackIndex).toBe(42);
    });
  });

  describe("sceneIndex", () => {
    it("should return sceneIndex from valid scene path", () => {
      const scene = LiveAPI.from("live_set scenes 4");

      expect(scene.sceneIndex).toBe(4);
    });

    it("should return sceneIndex from clip_slots path (session view)", () => {
      const clipSlot = LiveAPI.from("live_set tracks 2 clip_slots 6");

      expect(clipSlot.sceneIndex).toBe(6);
    });

    it("should prioritize scene path over clip_slots path", () => {
      // This would be an unusual case, but scene path should win
      const scene = LiveAPI.from("live_set scenes 10");

      expect(scene.sceneIndex).toBe(10);
    });

    it("should return null for non-scene/clip_slots paths", () => {
      const liveSet = LiveAPI.from("live_set");

      expect(liveSet.sceneIndex).toBe(null);

      const track = LiveAPI.from("live_set tracks 1");

      expect(track.sceneIndex).toBe(null);

      const device = LiveAPI.from("live_set tracks 1 devices 0");

      expect(device.sceneIndex).toBe(null);
    });

    it("should handle scene index 0", () => {
      const scene = LiveAPI.from("live_set scenes 0");

      expect(scene.sceneIndex).toBe(0);

      const clipSlot = LiveAPI.from("live_set tracks 1 clip_slots 0");

      expect(clipSlot.sceneIndex).toBe(0);
    });

    it("should handle double-digit scene indices", () => {
      const scene = LiveAPI.from("live_set scenes 99");

      expect(scene.sceneIndex).toBe(99);

      const clipSlot = LiveAPI.from("live_set tracks 5 clip_slots 99");

      expect(clipSlot.sceneIndex).toBe(99);
    });
  });

  describe("clipSlotIndex", () => {
    it("should return clipSlotIndex from valid clip_slots path", () => {
      const clipSlot = LiveAPI.from("live_set tracks 2 clip_slots 6");

      expect(clipSlot.clipSlotIndex).toBe(6);
    });

    it("should return clipSlotIndex from scene path (session view)", () => {
      const scene = LiveAPI.from("live_set scenes 8");

      expect(scene.clipSlotIndex).toBe(8);
    });

    it("should prioritize clip_slots path over scene path", () => {
      const clipSlot = LiveAPI.from("live_set tracks 1 clip_slots 5");

      expect(clipSlot.clipSlotIndex).toBe(5);
    });

    it("should return clipSlotIndex from nested clip path", () => {
      const clip = LiveAPI.from("live_set tracks 1 clip_slots 3 clip");

      expect(clip.clipSlotIndex).toBe(3);
    });

    it("should return null for non-clip_slots/scene paths", () => {
      const liveSet = LiveAPI.from("live_set");

      expect(liveSet.clipSlotIndex).toBe(null);

      const track = LiveAPI.from("live_set tracks 1");

      expect(track.clipSlotIndex).toBe(null);

      const device = LiveAPI.from("live_set tracks 1 devices 0");

      expect(device.clipSlotIndex).toBe(null);
    });

    it("should handle clipSlot index 0", () => {
      const clipSlot = LiveAPI.from("live_set tracks 0 clip_slots 0");

      expect(clipSlot.clipSlotIndex).toBe(0);

      const scene = LiveAPI.from("live_set scenes 0");

      expect(scene.clipSlotIndex).toBe(0);
    });

    it("should handle double-digit clipSlot indices", () => {
      const clipSlot = LiveAPI.from("live_set tracks 15 clip_slots 25");

      expect(clipSlot.clipSlotIndex).toBe(25);

      const scene = LiveAPI.from("live_set scenes 25");

      expect(scene.clipSlotIndex).toBe(25);
    });
  });

  describe("deviceIndex", () => {
    it("should return deviceIndex from regular track device path", () => {
      const device = LiveAPI.from("live_set tracks 0 devices 1");

      expect(device.deviceIndex).toBe(1);
    });

    it("should return deviceIndex from return track device path", () => {
      const device = LiveAPI.from("live_set return_tracks 0 devices 2");

      expect(device.deviceIndex).toBe(2);
    });

    it("should return deviceIndex from master track device path", () => {
      const device = LiveAPI.from("live_set master_track devices 0");

      expect(device.deviceIndex).toBe(0);
    });

    it("should return null for non-device paths", () => {
      const track = LiveAPI.from("live_set tracks 1");

      expect(track.deviceIndex).toBe(null);

      const liveSet = LiveAPI.from("live_set");

      expect(liveSet.deviceIndex).toBe(null);

      const clipSlot = LiveAPI.from("live_set tracks 1 clip_slots 0");

      expect(clipSlot.deviceIndex).toBe(null);
    });

    it("should handle device index 0", () => {
      const device = LiveAPI.from("live_set tracks 0 devices 0");

      expect(device.deviceIndex).toBe(0);
    });

    it("should handle double-digit device indices", () => {
      const device = LiveAPI.from("live_set tracks 0 devices 15");

      expect(device.deviceIndex).toBe(15);
    });

    it("should return last device index for nested rack devices", () => {
      const device = LiveAPI.from(
        "live_set tracks 0 devices 0 chains 0 devices 5",
      );

      expect(device.deviceIndex).toBe(5);
    });

    it("should return last device index for deeply nested rack devices", () => {
      const device = LiveAPI.from(
        "live_set tracks 0 devices 0 chains 0 devices 1 chains 0 devices 9",
      );

      expect(device.deviceIndex).toBe(9);
    });
  });

  describe("session view integration", () => {
    it("should extract both trackIndex and sceneIndex from clip_slots path", () => {
      const clipSlot = LiveAPI.from("live_set tracks 8 clip_slots 12");

      expect(clipSlot.trackIndex).toBe(8);
      expect(clipSlot.sceneIndex).toBe(12);
      expect(clipSlot.clipSlotIndex).toBe(12);
    });

    it("should work with scene objects in session view", () => {
      const scene = LiveAPI.from("live_set scenes 5");

      expect(scene.trackIndex).toBe(null);
      expect(scene.sceneIndex).toBe(5);
      expect(scene.clipSlotIndex).toBe(5);
    });

    it("should work with complex nested session paths", () => {
      const nestedPath = LiveAPI.from(
        "live_set tracks 3 clip_slots 7 clip notes 5",
      );

      expect(nestedPath.trackIndex).toBe(3);
      expect(nestedPath.sceneIndex).toBe(7);
      expect(nestedPath.clipSlotIndex).toBe(7);
    });
  });

  describe("edge cases", () => {
    it("should handle empty path", () => {
      const empty = LiveAPI.from("");

      expect(empty.trackIndex).toBe(null);
      expect(empty.sceneIndex).toBe(null);
      expect(empty.clipSlotIndex).toBe(null);
      expect(empty.deviceIndex).toBe(null);
    });

    it("should handle malformed paths", () => {
      const malformed1 = LiveAPI.from("live_set tracks");

      expect(malformed1.trackIndex).toBe(null);

      const malformed2 = LiveAPI.from("live_set scenes");

      expect(malformed2.sceneIndex).toBe(null);

      const malformed3 = LiveAPI.from("live_set tracks clip_slots 5");

      expect(malformed3.clipSlotIndex).toBe(null);

      const malformed4 = LiveAPI.from("live_set tracks 0 devices");

      expect(malformed4.deviceIndex).toBe(null);
    });

    it("should handle paths with non-numeric indices", () => {
      const nonNumeric1 = LiveAPI.from("live_set tracks abc");

      expect(nonNumeric1.trackIndex).toBe(null);

      const nonNumeric2 = LiveAPI.from("live_set scenes xyz");

      expect(nonNumeric2.sceneIndex).toBe(null);

      const nonNumeric3 = LiveAPI.from("live_set tracks 1 clip_slots abc");

      expect(nonNumeric3.clipSlotIndex).toBe(null);

      const nonNumeric4 = LiveAPI.from("live_set tracks 0 devices abc");

      expect(nonNumeric4.deviceIndex).toBe(null);
    });

    it("should handle floating point numbers in paths (should return integer part)", () => {
      // This shouldn't happen in real Live API paths, but test robustness
      const floatTrack = LiveAPI.from("live_set tracks 3.5");

      expect(floatTrack.trackIndex).toBe(3);
    });
  });

  describe("timeSignature getter", () => {
    it("should return correct time signature for LiveSet objects", () => {
      const liveSet = LiveAPI.from("live_set");

      liveSet.getProperty = vi.fn((prop) => {
        if (prop === "signature_numerator") {
          return 4;
        }

        if (prop === "signature_denominator") {
          return 4;
        }

        return null;
      });

      expect(liveSet.timeSignature).toBe("4/4");
      expect(liveSet.getProperty).toHaveBeenCalledWith("signature_numerator");
      expect(liveSet.getProperty).toHaveBeenCalledWith("signature_denominator");
    });

    it("should return correct time signature for Clip objects", () => {
      const clip = LiveAPI.from("live_set tracks 0 clip_slots 0 clip");

      clip.getProperty = vi.fn((prop) => {
        if (prop === "signature_numerator") {
          return 3;
        }

        if (prop === "signature_denominator") {
          return 4;
        }

        return null;
      });

      expect(clip.timeSignature).toBe("3/4");
      expect(clip.getProperty).toHaveBeenCalledWith("signature_numerator");
      expect(clip.getProperty).toHaveBeenCalledWith("signature_denominator");
    });

    it("should return correct time signature for Scene objects", () => {
      const scene = LiveAPI.from("live_set scenes 0");

      scene.getProperty = vi.fn((prop) => {
        if (prop === "time_signature_numerator") {
          return 6;
        }

        if (prop === "time_signature_denominator") {
          return 8;
        }

        return null;
      });

      expect(scene.timeSignature).toBe("6/8");
      expect(scene.getProperty).toHaveBeenCalledWith(
        "time_signature_numerator",
      );
      expect(scene.getProperty).toHaveBeenCalledWith(
        "time_signature_denominator",
      );
    });

    it("should return null when time signature properties are null", () => {
      const liveSet = LiveAPI.from("live_set");

      liveSet.getProperty = vi.fn(() => null);

      expect(liveSet.timeSignature).toBe(null);
    });

    it("should return null when only numerator is available", () => {
      const liveSet = LiveAPI.from("live_set");

      liveSet.getProperty = vi.fn((prop) => {
        if (prop === "signature_numerator") {
          return 4;
        }

        if (prop === "signature_denominator") {
          return null;
        }

        return null;
      });

      expect(liveSet.timeSignature).toBe(null);
    });

    it("should return null when only denominator is available", () => {
      const liveSet = LiveAPI.from("live_set");

      liveSet.getProperty = vi.fn((prop) => {
        if (prop === "signature_numerator") {
          return null;
        }

        if (prop === "signature_denominator") {
          return 4;
        }

        return null;
      });

      expect(liveSet.timeSignature).toBe(null);
    });

    it("should use signature_numerator/denominator as fallback for unknown object types", () => {
      // Create an API object with an unknown type
      const unknownObj = LiveAPI.from("unknown_object");

      unknownObj.getProperty = vi.fn((prop) => {
        if (prop === "signature_numerator") {
          return 2;
        }

        if (prop === "signature_denominator") {
          return 2;
        }

        return null;
      });

      expect(unknownObj.timeSignature).toBe("2/2");
      expect(unknownObj.getProperty).toHaveBeenCalledWith(
        "signature_numerator",
      );
      expect(unknownObj.getProperty).toHaveBeenCalledWith(
        "signature_denominator",
      );
    });
  });
});
