// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Max's LiveAPI lists no members for CC Control, so the extensions fill in what
// it still answers: its `type` field, `getcount` and each `parameters N` child.

import { beforeEach, describe, expect, it } from "vitest";
import { LIVE_API_DEVICE_TYPE_MIDI_EFFECT } from "#src/tools/constants.ts";
import { registerCcControl } from "#src/tools/device/tests/helpers/cc-control-fixtures.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import "../../live-api-extensions.ts";

describe("LiveAPI extensions - CC Control", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("reports the device-level properties it is known to have", () => {
    registerCcControl();
    const device = LiveAPI.from("id cc-1");

    expect(device.getProperty("type")).toBe(LIVE_API_DEVICE_TYPE_MIDI_EFFECT);
    expect(device.getProperty("class_display_name")).toBe("CC Control");
    expect(device.getProperty("class_name")).toBe("CcControlDevice");
  });

  it("leaves what it can't know unread: name and on/off", () => {
    registerCcControl();
    const device = LiveAPI.from("id cc-1");

    expect(device.getName()).toBe("");
    expect(device.getProperty("is_active")).toBeUndefined();
  });

  it("lists the parameters by counting and addressing each one", () => {
    registerCcControl({ paramNames: ["Device On", "Mod Wheel"] });
    const device = LiveAPI.from("id cc-1");

    expect(device.getChildIds("parameters")).toStrictEqual([
      "id 900",
      "id 901",
    ]);
    expect(
      device.getChildren("parameters").map((param) => param.getName()),
    ).toStrictEqual(["Device On", "Mod Wheel"]);
  });

  it("skips a counted parameter that turns out not to exist", () => {
    registerCcControl({ paramNames: ["Device On", "Mod Wheel"] });
    registerMockObject("0", {
      path: "live_set tracks 0 devices 0 parameters 1",
    });

    expect(LiveAPI.from("id cc-1").getChildIds("parameters")).toStrictEqual([
      "id 900",
    ]);
  });

  it("lists nothing for an object that is not a CC Control", () => {
    const track = LiveAPI.from("live_set tracks 0");

    expect(track.getChildIds("parameters")).toStrictEqual([]);
    expect(track.getProperty("class_display_name")).toBeUndefined();
  });
});
