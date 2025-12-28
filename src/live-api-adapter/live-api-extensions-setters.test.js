import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAPI } from "#src/test/mock-live-api.js";
import "./live-api-extensions.js";

describe("LiveAPI extensions - setter methods", () => {
  let api;

  beforeEach(() => {
    api = new LiveAPI("live_set");
    vi.resetAllMocks();
  });

  describe("setAll", () => {
    beforeEach(() => {
      api.set = vi.fn();
      api.setColor = vi.fn();
    });

    it("sets all non-null properties", () => {
      api.setAll({
        name: "Test Clip",
        signature_numerator: 4,
        signature_denominator: 4,
        start_marker: 0,
        end_marker: 4,
      });

      expect(api.set).toHaveBeenCalledWith("name", "Test Clip");
      expect(api.set).toHaveBeenCalledWith("signature_numerator", 4);
      expect(api.set).toHaveBeenCalledWith("signature_denominator", 4);
      expect(api.set).toHaveBeenCalledWith("start_marker", 0);
      expect(api.set).toHaveBeenCalledWith("end_marker", 4);
      expect(api.set).toHaveBeenCalledTimes(5);
    });

    it("skips null values", () => {
      api.setAll({
        name: "Test",
        start_marker: null,
        end_marker: 4,
      });

      expect(api.set).toHaveBeenCalledWith("name", "Test");
      expect(api.set).toHaveBeenCalledWith("end_marker", 4);
      expect(api.set).toHaveBeenCalledTimes(2);
      expect(api.set).not.toHaveBeenCalledWith("start_marker", null);
    });

    it("skips undefined values", () => {
      api.setAll({
        name: "Test",
        start_marker: undefined,
        end_marker: 4,
      });

      expect(api.set).toHaveBeenCalledWith("name", "Test");
      expect(api.set).toHaveBeenCalledWith("end_marker", 4);
      expect(api.set).toHaveBeenCalledTimes(2);
      expect(api.set).not.toHaveBeenCalledWith("start_marker", undefined);
    });

    it("uses setColor for color property", () => {
      api.setAll({
        name: "Colored Clip",
        color: "#FF0000",
      });

      expect(api.set).toHaveBeenCalledWith("name", "Colored Clip");
      expect(api.setColor).toHaveBeenCalledWith("#FF0000");
      expect(api.set).toHaveBeenCalledTimes(1);
      expect(api.set).not.toHaveBeenCalledWith("color", "#FF0000");
    });

    it("handles empty object", () => {
      api.setAll({});

      expect(api.set).not.toHaveBeenCalled();
      expect(api.setColor).not.toHaveBeenCalled();
    });

    it("handles mix of color and other properties with null values", () => {
      api.setAll({
        name: "Mixed",
        color: "#00FF00",
        loop_start: null,
        loop_end: 8,
        looping: true,
      });

      expect(api.set).toHaveBeenCalledWith("name", "Mixed");
      expect(api.setColor).toHaveBeenCalledWith("#00FF00");
      expect(api.set).toHaveBeenCalledWith("loop_end", 8);
      expect(api.set).toHaveBeenCalledWith("looping", true);
      expect(api.set).toHaveBeenCalledTimes(3);
      expect(api.set).not.toHaveBeenCalledWith("loop_start", null);
    });

    it("skips color when null", () => {
      api.setAll({
        name: "Test",
        color: null,
      });

      expect(api.set).toHaveBeenCalledWith("name", "Test");
      expect(api.setColor).not.toHaveBeenCalled();
    });

    it("allows zero as a valid value", () => {
      api.setAll({
        start_marker: 0,
        value: 0,
      });

      expect(api.set).toHaveBeenCalledWith("start_marker", 0);
      expect(api.set).toHaveBeenCalledWith("value", 0);
      expect(api.set).toHaveBeenCalledTimes(2);
    });

    it("allows false as a valid value", () => {
      api.setAll({
        looping: false,
      });

      expect(api.set).toHaveBeenCalledWith("looping", false);
    });

    it("allows empty string as a valid value", () => {
      api.setAll({
        name: "",
      });

      expect(api.set).toHaveBeenCalledWith("name", "");
    });
  });

  describe("setProperty", () => {
    beforeEach(() => {
      api.set = vi.fn();
    });

    it("should auto-format numeric ID for selected_track", () => {
      api.setProperty("selected_track", "123");
      expect(api.set).toHaveBeenCalledWith("selected_track", "id 123");
    });

    it("should auto-format numeric ID for selected_scene", () => {
      api.setProperty("selected_scene", "456");
      expect(api.set).toHaveBeenCalledWith("selected_scene", "id 456");
    });

    it("should auto-format numeric ID for detail_clip", () => {
      api.setProperty("detail_clip", "789");
      expect(api.set).toHaveBeenCalledWith("detail_clip", "id 789");
    });

    it("should auto-format numeric ID for highlighted_clip_slot", () => {
      api.setProperty("highlighted_clip_slot", "101");
      expect(api.set).toHaveBeenCalledWith("highlighted_clip_slot", "id 101");
    });

    it("should not double-format already prefixed IDs", () => {
      api.setProperty("selected_track", "id 123");
      expect(api.set).toHaveBeenCalledWith("selected_track", "id 123");
    });

    it("should pass through non-numeric strings unchanged", () => {
      api.setProperty("selected_track", "track_name");
      expect(api.set).toHaveBeenCalledWith("selected_track", "track_name");
    });

    it("should pass through non-selection properties unchanged", () => {
      api.setProperty("name", "123");
      expect(api.set).toHaveBeenCalledWith("name", "123");
    });

    it("should handle null values", () => {
      api.setProperty("selected_track", null);
      expect(api.set).toHaveBeenCalledWith("selected_track", null);
    });

    it("should handle undefined values", () => {
      api.setProperty("selected_scene", undefined);
      expect(api.set).toHaveBeenCalledWith("selected_scene", undefined);
    });

    it("should handle numeric strings with non-digits", () => {
      api.setProperty("selected_track", "123abc");
      expect(api.set).toHaveBeenCalledWith("selected_track", "123abc");
    });

    it("should handle IDs that already have id prefix with space", () => {
      api.setProperty("selected_track", "id track_123");
      expect(api.set).toHaveBeenCalledWith("selected_track", "id track_123");
    });

    it("should handle IDs that already have id prefix without space", () => {
      api.setProperty("selected_track", "idtrack_123");
      expect(api.set).toHaveBeenCalledWith("selected_track", "idtrack_123");
    });
  });
});
