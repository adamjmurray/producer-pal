import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { updateTrack } from "./update-track.js";
import "#src/live-api-adapter/live-api-extensions.js";
import * as console from "#src/shared/v8-max-console.js";

describe("updateTrack - mixer properties", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id 456":
          return "456";
        case "live_set tracks 0 mixer_device":
        case "live_set tracks 1 mixer_device":
          return this._path.includes("tracks 0") ? "mixer_1" : "mixer_2";
        case "live_set tracks 0 mixer_device volume":
          return "volume_param_1";
        case "live_set tracks 1 mixer_device volume":
          return "volume_param_2";
        case "live_set tracks 0 mixer_device panning":
          return "panning_param_1";
        case "live_set tracks 1 mixer_device panning":
          return "panning_param_2";
        default:
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "123":
          return "live_set tracks 0";
        case "456":
          return "live_set tracks 1";
        case "mixer_1":
          return "live_set tracks 0 mixer_device";
        case "mixer_2":
          return "live_set tracks 1 mixer_device";
        case "volume_param_1":
          return "live_set tracks 0 mixer_device volume";
        case "volume_param_2":
          return "live_set tracks 1 mixer_device volume";
        case "panning_param_1":
          return "live_set tracks 0 mixer_device panning";
        case "panning_param_2":
          return "live_set tracks 1 mixer_device panning";
        default:
          return this._path;
      }
    });
  });

  it("should update gain only", () => {
    updateTrack({
      ids: "123",
      gainDb: -6,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "volume_param_1" }),
      "display_value",
      -6,
    );
  });

  it("should update pan only", () => {
    updateTrack({
      ids: "123",
      pan: 0.5,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "panning_param_1" }),
      "value",
      0.5,
    );
  });

  it("should update both gain and pan", () => {
    updateTrack({
      ids: "123",
      gainDb: -3,
      pan: -0.25,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "volume_param_1" }),
      "display_value",
      -3,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "panning_param_1" }),
      "value",
      -0.25,
    );
  });

  it("should update gain/pan with other properties", () => {
    updateTrack({
      ids: "123",
      name: "Test Track",
      gainDb: -12,
      pan: 1,
      mute: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Test Track",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "volume_param_1" }),
      "display_value",
      -12,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "panning_param_1" }),
      "value",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "mute",
      true,
    );
  });

  it("should handle minimum gain value", () => {
    updateTrack({
      ids: "123",
      gainDb: -70,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "volume_param_1" }),
      "display_value",
      -70,
    );
  });

  it("should handle maximum gain value", () => {
    updateTrack({
      ids: "123",
      gainDb: 6,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "volume_param_1" }),
      "display_value",
      6,
    );
  });

  it("should handle minimum pan value (full left)", () => {
    updateTrack({
      ids: "123",
      pan: -1,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "panning_param_1" }),
      "value",
      -1,
    );
  });

  it("should handle maximum pan value (full right)", () => {
    updateTrack({
      ids: "123",
      pan: 1,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "panning_param_1" }),
      "value",
      1,
    );
  });

  it("should handle zero gain and center pan", () => {
    updateTrack({
      ids: "123",
      gainDb: 0,
      pan: 0,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "volume_param_1" }),
      "display_value",
      0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "panning_param_1" }),
      "value",
      0,
    );
  });

  it("should update mixer properties for multiple tracks", () => {
    updateTrack({
      ids: "123,456",
      gainDb: -6,
      pan: 0.5,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "volume_param_1" }),
      "display_value",
      -6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "panning_param_1" }),
      "value",
      0.5,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "volume_param_2" }),
      "display_value",
      -6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "panning_param_2" }),
      "value",
      0.5,
    );
  });

  it("should handle missing mixer device gracefully", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "live_set tracks 0 mixer_device":
          return "id 0"; // Non-existent mixer
        default:
          return this._id;
      }
    });

    updateTrack({
      ids: "123",
      gainDb: -6,
      pan: 0.5,
    });

    // Should not attempt to set mixer properties when mixer doesn't exist
    expect(liveApiSet).not.toHaveBeenCalledWith("display_value", -6);
    expect(liveApiSet).not.toHaveBeenCalledWith("value", 0.5);
  });

  it("should set panning mode to split", () => {
    updateTrack({
      ids: "123",
      panningMode: "split",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "mixer_1" }),
      "panning_mode",
      1,
    );
  });

  it("should set panning mode to stereo", () => {
    updateTrack({
      ids: "123",
      panningMode: "stereo",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "mixer_1" }),
      "panning_mode",
      0,
    );
  });

  it("should update leftPan and rightPan in split mode", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 0 mixer_device left_split_stereo":
          return "left_split_param_1";
        case "live_set tracks 0 mixer_device right_split_stereo":
          return "right_split_param_1";
        default:
          return this._id;
      }
    });

    mockLiveApiGet({
      mixer_1: {
        panning_mode: 1, // Split mode
      },
    });

    updateTrack({
      ids: "123",
      leftPan: -0.75,
      rightPan: 0.5,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "left_split_param_1" }),
      "value",
      -0.75,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "right_split_param_1" }),
      "value",
      0.5,
    );
  });

  it("should warn when setting pan in split mode", () => {
    const errorSpy = vi.spyOn(console, "error");

    mockLiveApiGet({
      mixer_1: {
        panning_mode: 1, // Split mode
      },
    });

    updateTrack({
      ids: "123",
      pan: 0.5,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("pan has no effect in split panning mode"),
    );

    errorSpy.mockRestore();
  });

  it("should warn when setting leftPan/rightPan in stereo mode", () => {
    const errorSpy = vi.spyOn(console, "error");

    mockLiveApiGet({
      mixer_1: {
        panning_mode: 0, // Stereo mode
      },
    });

    updateTrack({
      ids: "123",
      leftPan: -0.5,
      rightPan: 0.5,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "leftPan and rightPan have no effect in stereo panning mode",
      ),
    );

    errorSpy.mockRestore();
  });

  it("should switch mode and update panning in one call", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 0 mixer_device left_split_stereo":
          return "left_split_param_1";
        case "live_set tracks 0 mixer_device right_split_stereo":
          return "right_split_param_1";
        default:
          return this._id;
      }
    });

    mockLiveApiGet({
      mixer_1: {
        panning_mode: 0, // Start in stereo mode
      },
    });

    updateTrack({
      ids: "123",
      panningMode: "split",
      leftPan: -1,
      rightPan: 1,
    });

    // Should set mode first
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "mixer_1" }),
      "panning_mode",
      1,
    );

    // Then apply split panning
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "left_split_param_1" }),
      "value",
      -1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "right_split_param_1" }),
      "value",
      1,
    );
  });
});
