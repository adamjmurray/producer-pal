// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type MockObjectHandle,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateTrack } from "./update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import * as console from "#src/shared/v8-max-console.ts";

describe("updateTrack - mixer properties", () => {
  let track123: MockObjectHandle;
  let mixer1: MockObjectHandle;
  let volumeParam1: MockObjectHandle;
  let volumeParam2: MockObjectHandle;
  let panningParam1: MockObjectHandle;
  let panningParam2: MockObjectHandle;

  beforeEach(() => {
    track123 = registerMockObject("123", { path: "live_set tracks 0" });
    registerMockObject("456", { path: "live_set tracks 1" });
    mixer1 = registerMockObject("mixer_1", {
      path: "live_set tracks 0 mixer_device",
    });
    registerMockObject("mixer_2", {
      path: "live_set tracks 1 mixer_device",
    });
    volumeParam1 = registerMockObject("volume_param_1", {
      path: "live_set tracks 0 mixer_device volume",
    });
    volumeParam2 = registerMockObject("volume_param_2", {
      path: "live_set tracks 1 mixer_device volume",
    });
    panningParam1 = registerMockObject("panning_param_1", {
      path: "live_set tracks 0 mixer_device panning",
    });
    panningParam2 = registerMockObject("panning_param_2", {
      path: "live_set tracks 1 mixer_device panning",
    });
  });

  it("should update gain only", () => {
    updateTrack({
      ids: "123",
      gainDb: -6,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", -6);
  });

  it("should update pan only", () => {
    updateTrack({
      ids: "123",
      pan: 0.5,
    });

    expect(panningParam1.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("should update both gain and pan", () => {
    updateTrack({
      ids: "123",
      gainDb: -3,
      pan: -0.25,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", -3);
    expect(panningParam1.set).toHaveBeenCalledWith("value", -0.25);
  });

  it("should update gain/pan with other properties", () => {
    updateTrack({
      ids: "123",
      name: "Test Track",
      gainDb: -12,
      pan: 1,
      mute: true,
    });

    expect(track123.set).toHaveBeenCalledWith("name", "Test Track");
    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", -12);
    expect(panningParam1.set).toHaveBeenCalledWith("value", 1);
    expect(track123.set).toHaveBeenCalledWith("mute", true);
  });

  it("should handle minimum gain value", () => {
    updateTrack({
      ids: "123",
      gainDb: -70,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", -70);
  });

  it("should handle maximum gain value", () => {
    updateTrack({
      ids: "123",
      gainDb: 6,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", 6);
  });

  it("should handle minimum pan value (full left)", () => {
    updateTrack({
      ids: "123",
      pan: -1,
    });

    expect(panningParam1.set).toHaveBeenCalledWith("value", -1);
  });

  it("should handle maximum pan value (full right)", () => {
    updateTrack({
      ids: "123",
      pan: 1,
    });

    expect(panningParam1.set).toHaveBeenCalledWith("value", 1);
  });

  it("should handle zero gain and center pan", () => {
    updateTrack({
      ids: "123",
      gainDb: 0,
      pan: 0,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", 0);
    expect(panningParam1.set).toHaveBeenCalledWith("value", 0);
  });

  it("should update mixer properties for multiple tracks", () => {
    updateTrack({
      ids: "123,456",
      gainDb: -6,
      pan: 0.5,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", -6);
    expect(panningParam1.set).toHaveBeenCalledWith("value", 0.5);
    expect(volumeParam2.set).toHaveBeenCalledWith("display_value", -6);
    expect(panningParam2.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("should handle missing mixer device gracefully", () => {
    // Override mixer to be non-existent for this test
    registerMockObject("id 0", {
      path: "live_set tracks 0 mixer_device",
    });

    updateTrack({
      ids: "123",
      gainDb: -6,
      pan: 0.5,
    });

    // Should not attempt to set mixer properties when mixer doesn't exist
    expect(volumeParam1.set).not.toHaveBeenCalled();
    expect(panningParam1.set).not.toHaveBeenCalled();
  });

  it("should set panning mode to split", () => {
    updateTrack({
      ids: "123",
      panningMode: "split",
    });

    expect(mixer1.set).toHaveBeenCalledWith("panning_mode", 1);
  });

  it("should set panning mode to stereo", () => {
    updateTrack({
      ids: "123",
      panningMode: "stereo",
    });

    expect(mixer1.set).toHaveBeenCalledWith("panning_mode", 0);
  });

  it("should update leftPan and rightPan in split mode", () => {
    const leftSplitParam1 = registerMockObject("left_split_param_1", {
      path: "live_set tracks 0 mixer_device left_split_stereo",
    });
    const rightSplitParam1 = registerMockObject("right_split_param_1", {
      path: "live_set tracks 0 mixer_device right_split_stereo",
    });

    mixer1.get.mockImplementation((prop: string) => {
      if (prop === "panning_mode") return [1]; // Split mode

      return [0];
    });

    updateTrack({
      ids: "123",
      leftPan: -0.75,
      rightPan: 0.5,
    });

    expect(leftSplitParam1.set).toHaveBeenCalledWith("value", -0.75);
    expect(rightSplitParam1.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("should warn when setting pan in split mode", () => {
    const errorSpy = vi.spyOn(console, "warn");

    mixer1.get.mockImplementation((prop: string) => {
      if (prop === "panning_mode") return [1]; // Split mode

      return [0];
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
    const errorSpy = vi.spyOn(console, "warn");

    // Default panning_mode is 0 (stereo) from createGetMock fallback

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
    const leftSplitParam1 = registerMockObject("left_split_param_1", {
      path: "live_set tracks 0 mixer_device left_split_stereo",
    });
    const rightSplitParam1 = registerMockObject("right_split_param_1", {
      path: "live_set tracks 0 mixer_device right_split_stereo",
    });

    // Start in stereo mode (default)

    updateTrack({
      ids: "123",
      panningMode: "split",
      leftPan: -1,
      rightPan: 1,
    });

    // Should set mode first
    expect(mixer1.set).toHaveBeenCalledWith("panning_mode", 1);

    // Then apply split panning
    expect(leftSplitParam1.set).toHaveBeenCalledWith("value", -1);
    expect(rightSplitParam1.set).toHaveBeenCalledWith("value", 1);
  });
});
