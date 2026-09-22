// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { toolDefUpdateTrack } from "../update-track.def.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

/** The per-track params this suite parses through the published schema. */
type PairedParam =
  | "mute"
  | "solo"
  | "gainDb"
  | "sendGainDb"
  | "monitoringState"
  | "panningMode";

/**
 * Parse one param the way the MCP layer does before the handler runs.
 * @param param - Param name
 * @param value - The value a model sent
 * @returns What the handler receives
 */
function coerced(param: PairedParam, value: unknown): unknown {
  return toolDefUpdateTrack.toolOptions.inputSchema[param]?.parse(value);
}

describe("updateTrack - per-track booleans, numbers and enums", () => {
  let track123: RegisteredMockObject;
  let track456: RegisteredMockObject;
  let track789: RegisteredMockObject;
  let mixer1: RegisteredMockObject;
  let mixer2: RegisteredMockObject;
  let volume1: RegisteredMockObject;
  let volume2: RegisteredMockObject;
  let panning1: RegisteredMockObject;
  let panning2: RegisteredMockObject;
  let send1: RegisteredMockObject;
  let send3: RegisteredMockObject;

  beforeEach(() => {
    track123 = registerMockObject("123", { path: livePath.track(0) });
    track456 = registerMockObject("456", { path: livePath.track(1) });
    track789 = registerMockObject("789", { path: livePath.track(2) });

    mixer1 = registerMockObject("mixer_1", {
      path: livePath.track(0).mixerDevice(),
      properties: { sends: children("send_1", "send_2") },
    });
    mixer2 = registerMockObject("mixer_2", {
      path: livePath.track(1).mixerDevice(),
      properties: { sends: children("send_3", "send_4") },
    });

    volume1 = registerMockObject("volume_1", {
      path: `${livePath.track(0).mixerDevice()} volume`,
    });
    volume2 = registerMockObject("volume_2", {
      path: `${livePath.track(1).mixerDevice()} volume`,
    });
    panning1 = registerMockObject("panning_1", {
      path: `${livePath.track(0).mixerDevice()} panning`,
    });
    panning2 = registerMockObject("panning_2", {
      path: `${livePath.track(1).mixerDevice()} panning`,
    });

    registerMockObject("liveSet", {
      path: livePath.liveSet,
      properties: { return_tracks: children("return_A") },
    });
    registerMockObject("return_A", {
      path: livePath.returnTrack(0),
      properties: { name: "A-Reverb" },
    });

    send1 = registerMockObject("send_1", {});
    registerMockObject("send_2", {});
    send3 = registerMockObject("send_3", {});
    registerMockObject("send_4", {});
  });

  // The params are published as strings, so a model that sends a real boolean
  // or number still has to arrive as one the entries can be read out of.
  it("coerces a single typed value to a string", () => {
    expect(coerced("mute", true)).toBe("true");
    expect(coerced("gainDb", -6)).toBe("-6");
  });

  it("refuses an entry that names no boolean or no number in range", () => {
    const boolean = "each entry must be true or false";

    expect(() => coerced("mute", "true,maybe")).toThrow(boolean);
    expect(() => coerced("solo", "")).toThrow(boolean);
    expect(() => coerced("gainDb", "-6,99")).toThrow(
      "each entry must be a number from -70 to 6",
    );
    expect(() => coerced("sendGainDb", "3")).toThrow(
      "each entry must be a number from -70 to 0",
    );
  });

  it("refuses an entry outside an enum's set", () => {
    expect(() => coerced("monitoringState", "in,nope")).toThrow(
      "each entry must be one of: in, auto, off",
    );
    expect(() => coerced("panningMode", "")).toThrow(
      "each entry must be one of: stereo, split",
    );
  });

  it("pairs monitoringState and panningMode one per track", () => {
    updateTrack({
      id: "123,456",
      monitoringState: "in,off",
      panningMode: "split,stereo",
    });

    expect(track123.set).toHaveBeenCalledWith("current_monitoring_state", 0);
    expect(track456.set).toHaveBeenCalledWith("current_monitoring_state", 2);
    expect(mixer1.set).toHaveBeenCalledWith("panning_mode", 1);
    expect(mixer2.set).toHaveBeenCalledWith("panning_mode", 0);
  });

  it("reads an enum entry in any case, and broadcasts a lone one", () => {
    updateTrack({ id: "123,456", monitoringState: "AUTO" });

    expect(track123.set).toHaveBeenCalledWith("current_monitoring_state", 1);
    expect(track456.set).toHaveBeenCalledWith("current_monitoring_state", 1);
  });

  it("refuses an enum list of the wrong length", () => {
    expect(() =>
      updateTrack({ id: "123,456,789", panningMode: "split,stereo" }),
    ).toThrow("id names 3 entries but panningMode names 2 entries");

    expect(mixer1.set).not.toHaveBeenCalled();
  });

  it("pairs mute, solo and arm one per track", () => {
    updateTrack({
      id: "123,456,789",
      mute: "true,false,true",
      solo: "false",
      arm: "true,true,false",
    });

    expect(track123.set).toHaveBeenCalledWith("mute", true);
    expect(track456.set).toHaveBeenCalledWith("mute", false);
    expect(track789.set).toHaveBeenCalledWith("mute", true);

    // One value still covers every track.
    for (const track of [track123, track456, track789]) {
      expect(track.set).toHaveBeenCalledWith("solo", false);
    }

    expect(track123.set).toHaveBeenCalledWith("arm", true);
    expect(track789.set).toHaveBeenCalledWith("arm", false);
  });

  it("pairs the mixer numbers one per track", () => {
    updateTrack({ id: "123,456", gainDb: "-6,-12", pan: "0.5" });

    expect(volume1.set).toHaveBeenCalledWith("display_value", -6);
    expect(volume2.set).toHaveBeenCalledWith("display_value", -12);
    expect(panning1.set).toHaveBeenCalledWith("value", 0.5);
    expect(panning2.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("pairs sendGainDb with one sendReturn for every track", () => {
    updateTrack({ id: "123,456", sendGainDb: "-6,-12", sendReturn: "A" });

    expect(send1.set).toHaveBeenCalledWith("display_value", -6);
    expect(send3.set).toHaveBeenCalledWith("display_value", -12);
  });

  it("refuses a list of the wrong length before any track is touched", () => {
    expect(() =>
      updateTrack({ id: "123,456,789", mute: "true,false" }),
    ).toThrow("id names 3 entries but mute names 2 entries");

    expect(track123.set).not.toHaveBeenCalled();
  });

  it("refuses a list with an empty entry before any track is touched", () => {
    expect(() => updateTrack({ id: "123,456,789", gainDb: "-6,,-12" })).toThrow(
      'invalid gainDb "-6,,-12" - it has an empty entry',
    );

    expect(volume1.set).not.toHaveBeenCalled();
  });
});
