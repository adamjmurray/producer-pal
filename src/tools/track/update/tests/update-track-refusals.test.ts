// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const SPLIT_ONLY =
  "leftPan/rightPan had no effect: they only apply in split panning mode — " +
  "set panningMode to 'split', or use pan";
const STEREO_ONLY =
  "pan had no effect: it only applies in stereo panning mode — set " +
  "panningMode to 'stereo', or use leftPan/rightPan";
const GAIN_DISABLED = "gainDb is disabled and was not changed";
const NO_MAIN_SWITCH = "the main track has no mute or solo";
const CANT_ARM = "return, main and group tracks can't be armed";
const NOT_ARMABLE = `arm had no effect: ${CANT_ARM}`;

// A write the track can't take is refused on its entry: ok:false when it was
// all the call asked of that track, a throw when that track was the only one,
// and a detail beside whatever else landed.
describe("updateTrack - refused mixer writes", () => {
  let panningParam: RegisteredMockObject;
  let volumeParam: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("123", { path: livePath.track(0) });
    registerMockObject("456", { path: livePath.track(1) });
    registerMockObject("mixer_1", { path: livePath.track(0).mixerDevice() });
    registerMockObject("mixer_2", { path: livePath.track(1).mixerDevice() });
    volumeParam = registerMockObject("volume_param_1", {
      path: `${livePath.track(0).mixerDevice()} volume`,
    });
    panningParam = registerMockObject("panning_param_1", {
      path: `${livePath.track(0).mixerDevice()} panning`,
    });
    registerMockObject("panning_param_2", {
      path: `${livePath.track(1).mixerDevice()} panning`,
    });
  });

  it("throws for a lone pan on a split-mode track", () => {
    splitMode();

    expect(() => updateTrack({ id: "123", pan: 0.5 })).toThrow(STEREO_ONLY);
    expect(panningParam.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("throws for a lone leftPan/rightPan on a stereo-mode track", () => {
    expect(() => updateTrack({ id: "123", leftPan: -1, rightPan: 1 })).toThrow(
      SPLIT_ONLY,
    );
  });

  it("throws for a lone gain Live has disabled", () => {
    volumeParam = disableVolume();

    expect(() => updateTrack({ id: "123", gainDb: -6 })).toThrow(GAIN_DISABLED);
    expect(volumeParam.set).not.toHaveBeenCalled();
  });

  it("keeps the hit and says why pan didn't land beside a gain that did", () => {
    splitMode();

    expect(updateTrack({ id: "123", gainDb: -6, pan: 0.5 })).toStrictEqual({
      id: "123",
      path: "t0",
      panningMode: "split",
      detail: STEREO_ONLY,
    });
    expect(volumeParam.set).toHaveBeenCalledWith("display_value", -6);
  });

  it("counts a panningMode that landed as work beside refused split pans", () => {
    expect(
      updateTrack({ id: "123", panningMode: "stereo", leftPan: -1 }),
    ).toStrictEqual({ id: "123", path: "t0", detail: SPLIT_ONLY });
  });

  it("keeps the hit beside a disabled gain when a pan landed", () => {
    disableVolume();

    expect(updateTrack({ id: "123", gainDb: -6, pan: 0.5 })).toStrictEqual({
      id: "123",
      path: "t0",
      detail: expect.stringContaining(GAIN_DISABLED),
    });
    expect(panningParam.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("keeps a refused track's slot in a multi-track call", () => {
    splitMode();

    expect(updateTrack({ id: "123,456", pan: 0.5 })).toStrictEqual([
      { id: "123", ok: false, detail: STEREO_ONLY },
      { id: "456", path: "t1" },
    ]);
  });
});

describe("updateTrack - refused mute, solo and arm", () => {
  let mainTrack: RegisteredMockObject;
  let returnTrack: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("123", { path: livePath.track(0) });
    mainTrack = registerMockObject("main", {
      path: livePath.masterTrack(),
      properties: { can_be_armed: 0 },
    });
    returnTrack = registerMockObject("ret1", {
      path: livePath.returnTrack(0),
      properties: { can_be_armed: 0 },
    });
  });

  it.each([
    ["mute", { mute: true }],
    ["solo", { solo: true }],
  ])("throws for a lone %s on the main track", (switchName, params) => {
    expect(() => updateTrack({ id: "main", ...params })).toThrow(
      `${switchName} had no effect: ${NO_MAIN_SWITCH}`,
    );
    expect(mainTrack.set).not.toHaveBeenCalledWith(
      switchName,
      expect.anything(),
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("keeps the hit and says why mute didn't land beside a color that did", () => {
    const result = updateTrack({ id: "main", color: "#FF0000", mute: true });

    expect(result).toStrictEqual({
      id: "main",
      path: "mt",
      detail: `mute had no effect: ${NO_MAIN_SWITCH}`,
    });
    expect(mainTrack.set).toHaveBeenCalledWith("color", 16711680);
    expect(mainTrack.set).not.toHaveBeenCalledWith("mute", expect.anything());
  });

  it("keeps the hit beside a name that landed on the main track", () => {
    const result = updateTrack({ id: "main", name: "Master", mute: true });

    expect(result).toStrictEqual({
      id: "main",
      path: "mt",
      detail: `mute had no effect: ${NO_MAIN_SWITCH}`,
    });
    expect(mainTrack.set).toHaveBeenCalledWith("name", "Master");
  });

  it("names both switches once when mute and solo are refused together", () => {
    expect(() => updateTrack({ id: "main", mute: true, solo: true })).toThrow(
      `mute and solo had no effect: ${NO_MAIN_SWITCH}`,
    );
  });

  // Off is already the state the call asked for, so it is a no-op, not a
  // refusal: a detail, no ok, and never a throw.
  it("says mute and solo are already off on the main track", () => {
    expect(updateTrack({ id: "main", mute: false, solo: false })).toStrictEqual(
      {
        id: "main",
        path: "mt",
        detail: `mute and solo already off: ${NO_MAIN_SWITCH}`,
      },
    );
    expect(mainTrack.set).not.toHaveBeenCalledWith("mute", expect.anything());
    expect(mainTrack.set).not.toHaveBeenCalledWith("solo", expect.anything());
  });

  it("says arm is already off on a track that can't be armed", () => {
    expect(updateTrack({ id: "ret1", arm: false })).toStrictEqual({
      id: "ret1",
      path: "rt0",
      detail: `arm already off: ${CANT_ARM}`,
    });
    expect(returnTrack.set).not.toHaveBeenCalledWith("arm", expect.anything());
  });

  it("keeps an off arm's entry a hit in a multi-track call", () => {
    expect(updateTrack({ id: "123,ret1", arm: false })).toStrictEqual([
      { id: "123", path: "t0" },
      { id: "ret1", path: "rt0", detail: `arm already off: ${CANT_ARM}` },
    ]);
  });

  it("refuses mute on the main track but notes solo off as done", () => {
    expect(updateTrack({ id: "main", mute: true, solo: false })).toStrictEqual({
      id: "main",
      path: "mt",
      detail:
        `mute had no effect: ${NO_MAIN_SWITCH}; ` +
        `solo already off: ${NO_MAIN_SWITCH}`,
    });
  });

  it("sets mute and solo on a return track", () => {
    expect(updateTrack({ id: "ret1", mute: true, solo: true })).toStrictEqual({
      id: "ret1",
      path: "rt0",
    });
    expect(returnTrack.set).toHaveBeenCalledWith("mute", true);
    expect(returnTrack.set).toHaveBeenCalledWith("solo", true);
  });

  it("sets mute and solo on a group track", () => {
    const group = registerMockObject("grp1", {
      path: livePath.track(5),
      properties: { can_be_armed: 0, is_foldable: 1 },
    });

    expect(updateTrack({ id: "grp1", mute: true, solo: true })).toStrictEqual({
      id: "grp1",
      path: "t5",
    });
    expect(group.set).toHaveBeenCalledWith("mute", true);
    expect(group.set).toHaveBeenCalledWith("solo", true);
  });

  it.each([
    ["return", "ret1"],
    ["main", "main"],
  ])("throws for a lone arm on a %s track", (_kind, id) => {
    expect(() => updateTrack({ id, arm: true })).toThrow(NOT_ARMABLE);
  });

  it("throws for a lone arm on a group track", () => {
    const group = registerMockObject("grp1", {
      path: livePath.track(5),
      properties: { can_be_armed: 0, is_foldable: 1 },
    });

    expect(() => updateTrack({ id: "grp1", arm: true })).toThrow(NOT_ARMABLE);
    expect(group.set).not.toHaveBeenCalledWith("arm", expect.anything());
  });

  it("keeps the hit beside a mute that landed on a non-armable track", () => {
    expect(updateTrack({ id: "ret1", mute: true, arm: true })).toStrictEqual({
      id: "ret1",
      path: "rt0",
      detail: NOT_ARMABLE,
    });
    expect(returnTrack.set).toHaveBeenCalledWith("mute", true);
    expect(returnTrack.set).not.toHaveBeenCalledWith("arm", expect.anything());
  });

  it("keeps a refused track's slot in a multi-track call", () => {
    expect(updateTrack({ id: "123,ret1,main", arm: true })).toStrictEqual([
      { id: "123", path: "t0" },
      { id: "ret1", ok: false, detail: NOT_ARMABLE },
      { id: "main", ok: false, detail: NOT_ARMABLE },
    ]);
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
 * Make track 0's volume a parameter Live has disabled.
 * @returns The disabled volume parameter mock
 */
function disableVolume(): RegisteredMockObject {
  return registerMockObject("volume_param_1", {
    path: `${livePath.track(0).mixerDevice()} volume`,
    properties: { is_enabled: 0 },
  });
}
