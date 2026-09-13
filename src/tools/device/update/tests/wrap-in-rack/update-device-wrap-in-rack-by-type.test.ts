// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A wrap says what a container holds when `inst`/`mfx<n>`/`afx<n>` names no
// device in it — the only thing a wrap can say, since it answers with one rack
// for the whole call rather than an entry per device.

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  livePath,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import {
  registerAudioEffectDevice,
  registerTrack0,
} from "./update-device-wrap-in-rack-test-helpers.ts";

describe("updateDevice - wrapInRack by device type", () => {
  beforeEach(() => {
    registerTrack0();
    registerAudioEffectDevice("device-0", 0);
    registerMockObject("live-set", { path: livePath.liveSet });
  });

  it("says what the track holds when a device path names nothing", () => {
    expect(updateDevice({ path: "t0/inst", wrapInRack: true })).toBeNull();
    // The miss, then the summary every empty device set gets.
    expect(capturedWarnings()).toStrictEqual([
      'wrapInRack: nothing at path "t0/inst": t0 has no instrument',
      "wrapInRack: no devices found",
    ]);
  });

  it("says what the track holds when toPath names nothing", () => {
    expect(
      updateDevice({ path: "t0/d0", wrapInRack: true, toPath: "t0/inst" }),
    ).toBeNull();
    expect(capturedWarnings()).toStrictEqual([
      'wrapInRack: nothing at toPath "t0/inst": t0 has no instrument',
    ]);
  });
});
