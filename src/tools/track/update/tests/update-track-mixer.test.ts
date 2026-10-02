// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  keepsParamValue,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

const CHANGED_GAIN = "gainDb read back as shown, not as sent";

describe("updateTrack - mixer properties", () => {
  let track123: RegisteredMockObject;
  let mixer1: RegisteredMockObject;
  let volumeParam1: RegisteredMockObject;
  let volumeParam2: RegisteredMockObject;
  let panningParam1: RegisteredMockObject;
  let panningParam2: RegisteredMockObject;

  beforeEach(() => {
    track123 = registerMockObject("123", { path: livePath.track(0) });
    registerMockObject("456", { path: livePath.track(1) });
    mixer1 = registerMockObject("mixer_1", {
      path: livePath.track(0).mixerDevice(),
    });
    registerMockObject("mixer_2", {
      path: livePath.track(1).mixerDevice(),
    });
    volumeParam1 = registerMockObject("volume_param_1", {
      path: `${livePath.track(0).mixerDevice()} volume`,
    });
    volumeParam2 = registerMockObject("volume_param_2", {
      path: `${livePath.track(1).mixerDevice()} volume`,
    });
    panningParam1 = registerMockObject("panning_param_1", {
      path: `${livePath.track(0).mixerDevice()} panning`,
    });
    panningParam2 = registerMockObject("panning_param_2", {
      path: `${livePath.track(1).mixerDevice()} panning`,
    });
  });

  it("should update gain only", () => {
    updateTrack({
      id: "123",
      gainDb: -6,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", -6);
  });

  it("should update pan only", () => {
    updateTrack({
      id: "123",
      pan: 0.5,
    });

    expect(panningParam1.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("should update both gain and pan", () => {
    updateTrack({
      id: "123",
      gainDb: -3,
      pan: -0.25,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", -3);
    expect(panningParam1.set).toHaveBeenCalledWith("value", -0.25);
  });

  it("should update gain/pan with other properties", () => {
    updateTrack({
      id: "123",
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
      id: "123",
      gainDb: -70,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", -70);
  });

  it("should handle maximum gain value", () => {
    updateTrack({
      id: "123",
      gainDb: 6,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", 6);
  });

  it("should handle minimum pan value (full left)", () => {
    updateTrack({
      id: "123",
      pan: -1,
    });

    expect(panningParam1.set).toHaveBeenCalledWith("value", -1);
  });

  it("should handle maximum pan value (full right)", () => {
    updateTrack({
      id: "123",
      pan: 1,
    });

    expect(panningParam1.set).toHaveBeenCalledWith("value", 1);
  });

  it("should handle zero gain and center pan", () => {
    updateTrack({
      id: "123",
      gainDb: 0,
      pan: 0,
    });

    expect(volumeParam1.set).toHaveBeenCalledWith("display_value", 0);
    expect(panningParam1.set).toHaveBeenCalledWith("value", 0);
  });

  it("should update mixer properties for multiple tracks", () => {
    updateTrack({
      id: "123,456",
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
      path: livePath.track(0).mixerDevice(),
    });

    updateTrack({
      id: "123",
      gainDb: -6,
      pan: 0.5,
    });

    // Should not attempt to set mixer properties when mixer doesn't exist
    expect(volumeParam1.set).not.toHaveBeenCalled();
    expect(panningParam1.set).not.toHaveBeenCalled();
  });

  it("should set panning mode to split", () => {
    updateTrack({
      id: "123",
      panningMode: "split",
    });

    expect(mixer1.set).toHaveBeenCalledWith("panning_mode", 1);
  });

  it("should set panning mode to stereo", () => {
    updateTrack({
      id: "123",
      panningMode: "stereo",
    });

    expect(mixer1.set).toHaveBeenCalledWith("panning_mode", 0);
  });

  it("should update leftPan and rightPan in split mode", () => {
    const { leftSplitParam1, rightSplitParam1 } = registerSplitPanParams();

    mixer1.get.mockImplementation((prop: string) => {
      if (prop === "panning_mode") {
        return [1];
      } // Split mode

      return [0];
    });

    updateTrack({
      id: "123",
      leftPan: -0.75,
      rightPan: 0.5,
    });

    expect(leftSplitParam1.set).toHaveBeenCalledWith("value", -0.75);
    expect(rightSplitParam1.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("should switch mode and update panning in one call", () => {
    const { leftSplitParam1, rightSplitParam1 } = registerSplitPanParams();

    // Start in stereo mode (default)

    updateTrack({
      id: "123",
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

  it("should skip gain when the volume parameter does not exist", () => {
    // Mixer exists but its volume child does not.
    registerMockObject("id 0", {
      path: `${livePath.track(0).mixerDevice()} volume`,
    });

    updateTrack({ id: "123", gainDb: -6 });

    expect(volumeParam1.set).not.toHaveBeenCalled();
  });

  it("should skip pan when the panning parameter does not exist", () => {
    // Mixer exists but its panning child does not.
    registerMockObject("id 0", {
      path: `${livePath.track(0).mixerDevice()} panning`,
    });

    updateTrack({ id: "123", pan: 0.5 });

    expect(panningParam1.set).not.toHaveBeenCalled();
  });

  it("should skip split panning when split parameters do not exist", () => {
    // Mixer is in split mode but the split stereo children do not exist.
    mixer1.get.mockImplementation((prop: string) => {
      if (prop === "panning_mode") {
        return [1];
      } // Split mode

      return [0];
    });
    const leftSplitParam1 = registerMockObject("id 0", {
      path: `${livePath.track(0).mixerDevice()} left_split_stereo`,
    });
    const rightSplitParam1 = registerMockObject("id 0", {
      path: `${livePath.track(0).mixerDevice()} right_split_stereo`,
    });

    updateTrack({ id: "123", leftPan: -0.75, rightPan: 0.5 });

    expect(leftSplitParam1.set).not.toHaveBeenCalled();
    expect(rightSplitParam1.set).not.toHaveBeenCalled();
  });

  // The result says only what Live didn't keep. Live clamps and snaps both, so
  // this can only be told apart by reading the parameters back after the write.
  it("reports the gain and pan Live kept, not the ones asked for", () => {
    keepsParamValue(volumeParam1, -6.02);
    keepsParamValue(panningParam1, 0.26);

    const result = updateTrack({ id: "123", gainDb: -6, pan: 0.25 });

    // Stereo is the mode every caller assumes, so it goes unsaid.
    expect(result).toStrictEqual({
      id: "123",
      path: "t0",
      gainDb: -6.02,
      pan: 0.26,
      detail: "gainDb, pan read back as shown, not as sent",
    });
  });

  it("says nothing about a gain and pan that landed as asked", () => {
    keepsParamValue(volumeParam1, -6);
    keepsParamValue(panningParam1, 0.25);

    expect(updateTrack({ id: "123", gainDb: -6, pan: 0.25 })).toStrictEqual({
      id: "123",
      path: "t0",
    });
  });

  it("counts the raw float32 as the value asked for", () => {
    // Live keeps a float32 of the request and hands back noise past the
    // resolution a read reports — the same value, so nothing to report.
    keepsParamValue(volumeParam1, -6.333000183105469);
    keepsParamValue(panningParam1, -0.30000001192092896);

    expect(
      updateTrack({ id: "123", gainDb: -6.333333, pan: -0.3 }),
    ).toStrictEqual({ id: "123", path: "t0" });
  });

  // Max serializes an exponent-notation float as a string, so nothing comes
  // back to read. The argument stands in, and a sub-1% pan rounds to the
  // centered value it amounts to — which is what was asked for, so it is silent.
  it("says nothing when Live answers with a string for the pan it kept", () => {
    keepsParamValue(panningParam1, "9.999999747378752e-05");

    expect(updateTrack({ id: "123", pan: 0.0001 })).toStrictEqual({
      id: "123",
      path: "t0",
    });
  });

  // A fader at the bottom of its range reads "-inf", which is no number to
  // compare -70 with — so it reports, the way a read publishes it.
  it("reports a gain that reads back as a label instead of a number", () => {
    keepsParamValue(volumeParam1, "-inf");

    expect(updateTrack({ id: "123", gainDb: -70 })).toStrictEqual({
      id: "123",
      path: "t0",
      gainDb: "-inf",
      detail: CHANGED_GAIN,
    });
  });

  it("reports each track's own read-back across a multi-track call", () => {
    keepsParamValue(volumeParam1, -6.02);
    keepsParamValue(volumeParam2, -5.98);

    expect(updateTrack({ id: "123,456", gainDb: -6 })).toStrictEqual([
      { id: "123", path: "t0", gainDb: -6.02, detail: CHANGED_GAIN },
      { id: "456", path: "t1", gainDb: -5.98, detail: CHANGED_GAIN },
    ]);
  });

  it("reports nothing for a mixer value the call never wrote", () => {
    keepsParamValue(volumeParam1, -6.02);

    // pan wasn't asked for, so neither it nor the panning mode is reported.
    expect(updateTrack({ id: "123", gainDb: -6 })).toStrictEqual({
      id: "123",
      path: "t0",
      gainDb: -6.02,
      detail: CHANGED_GAIN,
    });
  });

  it("reports the split pans Live kept, not the ones asked for", () => {
    const { leftSplitParam1, rightSplitParam1 } = registerSplitPanParams();

    splitMode();
    keepsParamValue(leftSplitParam1, -0.74000001);
    keepsParamValue(rightSplitParam1, 0.51000002);

    expect(
      updateTrack({ id: "123", leftPan: -0.75, rightPan: 0.5 }),
    ).toStrictEqual({
      id: "123",
      path: "t0",
      leftPan: -0.74,
      rightPan: 0.51,
      panningMode: "split",
      detail: "leftPan, rightPan read back as shown, not as sent",
    });
  });

  it("says nothing about split pans that landed as asked", () => {
    const { leftSplitParam1, rightSplitParam1 } = registerSplitPanParams();

    splitMode();
    keepsParamValue(leftSplitParam1, -0.75);
    keepsParamValue(rightSplitParam1, 0.5);

    expect(
      updateTrack({ id: "123", leftPan: -0.75, rightPan: 0.5 }),
    ).toStrictEqual({ id: "123", path: "t0", panningMode: "split" });
  });

  // Split is the mode a caller doesn't expect, so it is reported whichever of
  // the three pan params reached for it — rightPan alone included.
  it("reports split mode for a call that sent rightPan alone", () => {
    const { rightSplitParam1 } = registerSplitPanParams();

    splitMode();
    keepsParamValue(rightSplitParam1, 0.5);

    expect(updateTrack({ id: "123", rightPan: 0.5 })).toStrictEqual({
      id: "123",
      path: "t0",
      panningMode: "split",
    });
  });

  it("reports the gain Live changed beside split pans that landed", () => {
    const { leftSplitParam1, rightSplitParam1 } = registerSplitPanParams();

    splitMode();
    keepsParamValue(volumeParam1, -6.02);
    keepsParamValue(leftSplitParam1, -1);
    keepsParamValue(rightSplitParam1, 1);

    expect(
      updateTrack({ id: "123", gainDb: -6, leftPan: -1, rightPan: 1 }),
    ).toStrictEqual({
      id: "123",
      path: "t0",
      gainDb: -6.02,
      panningMode: "split",
      detail: CHANGED_GAIN,
    });
  });

  it("writes the split pans after switching mode in the same call", () => {
    const { leftSplitParam1, rightSplitParam1 } = registerSplitPanParams();

    // Starts in stereo, so only the panningMode write puts the pans in reach.
    keepsParamValue(leftSplitParam1, -1);
    keepsParamValue(rightSplitParam1, 1);

    // The caller set the mode, so it isn't reported back, and both pans landed.
    expect(
      updateTrack({
        id: "123",
        panningMode: "split",
        leftPan: -1,
        rightPan: 1,
      }),
    ).toStrictEqual({ id: "123", path: "t0" });

    expect(leftSplitParam1.set).toHaveBeenCalledWith("value", -1);
    expect(rightSplitParam1.set).toHaveBeenCalledWith("value", 1);
  });

  it("reports pan after switching back to stereo in the same call", () => {
    const { leftSplitParam1, rightSplitParam1 } = registerSplitPanParams();

    // Starts split, so only the panningMode write puts `pan` in reach.
    splitMode();
    keepsParamValue(panningParam1, 0.51);
    keepsParamValue(leftSplitParam1, -1);
    keepsParamValue(rightSplitParam1, 1);

    expect(
      updateTrack({ id: "123", panningMode: "stereo", pan: 0.5 }),
    ).toStrictEqual({
      id: "123",
      path: "t0",
      pan: 0.51,
      detail: "pan read back as shown, not as sent",
    });

    expect(mixer1.set).toHaveBeenCalledWith("panning_mode", 0);
    // The split params belong to the mode the call left, so they stay untouched.
    expect(leftSplitParam1.set).not.toHaveBeenCalled();
    expect(rightSplitParam1.set).not.toHaveBeenCalled();
  });

  it("omits a split pan when its parameter does not exist", () => {
    splitMode();
    registerMockObject("id 0", {
      path: `${livePath.track(0).mixerDevice()} left_split_stereo`,
    });
    const rightSplitParam1 = registerMockObject("right_split_param_1", {
      path: `${livePath.track(0).mixerDevice()} right_split_stereo`,
    });

    keepsParamValue(rightSplitParam1, 0.98);

    expect(updateTrack({ id: "123", leftPan: -1, rightPan: 1 })).toStrictEqual({
      id: "123",
      path: "t0",
      rightPan: 0.98,
      panningMode: "split",
      detail: "rightPan read back as shown, not as sent",
    });
  });
});

/**
 * Put track 0's mixer in split panning mode.
 */
function splitMode(): void {
  registerMockObject("mixer_1", {
    path: livePath.track(0).mixerDevice(),
    properties: { panning_mode: 1 },
  });
}

/**
 * Register left and right split stereo panning parameter mocks for track 0.
 * @returns The registered split pan parameter mocks
 */
function registerSplitPanParams(): {
  leftSplitParam1: RegisteredMockObject;
  rightSplitParam1: RegisteredMockObject;
} {
  return {
    leftSplitParam1: registerMockObject("left_split_param_1", {
      path: `${livePath.track(0).mixerDevice()} left_split_stereo`,
    }),
    rightSplitParam1: registerMockObject("right_split_param_1", {
      path: `${livePath.track(0).mixerDevice()} right_split_stereo`,
    }),
  };
}
