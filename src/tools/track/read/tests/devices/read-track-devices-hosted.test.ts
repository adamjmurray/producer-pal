// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A wrapper with no plug-in loaded reads the same in a track's device list as
// in read-device: as the plug-in it was saved for, with a `detail` saying why.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import {
  infoReply,
  installWrapper,
  registerWrapperDevice,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import {
  NO_PLUGIN_LOADED,
  PLUGIN_NOT_LOADED,
} from "#src/tools/shared/device/helpers/params/hosted-plugin-reading.ts";
import { setupTrackMock } from "../helpers/read-track-registry-test-helpers.ts";
import { readOneTrack } from "../../read-track.ts";

/**
 * Put a wrapper on track 0 and have it answer `info`.
 * @param info - What the wrapper says about itself
 */
function setupWrapperTrack(info: ReturnType<typeof infoReply>): void {
  registerWrapperDevice({
    path: String(livePath.track(0).device(0)),
    name: "PPal Plug-in Instrument",
    className: "MxDeviceInstrument",
    type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
  });
  setupTrackMock({
    trackId: "track1",
    properties: { devices: children("device-123") },
  });
  installWrapper({ info: () => info });
}

describe("readOneTrack on a wrapper with no plug-in loaded", () => {
  it("lists a wrapper whose plug-in is missing as that plug-in, with why", () => {
    setupWrapperTrack(infoReply(null, "Enstriate"));

    const result = readOneTrack({ trackIndex: 0, include: ["devices"] });

    expect(result.devices).toStrictEqual([
      {
        id: "device-123",
        path: "t0/d0",
        type: "instrument: Enstriate",
        hosted: true,
        detail: PLUGIN_NOT_LOADED,
      },
    ]);
    expect(result.instrument).toBe("Enstriate");
  });

  it("lists a bare wrapper as having no plug-in loaded", () => {
    setupWrapperTrack(infoReply(null));

    const result = readOneTrack({ trackIndex: 0, include: ["devices"] });

    expect(result.devices).toStrictEqual([
      {
        id: "device-123",
        path: "t0/d0",
        type: "instrument: Max Audio Effect",
        hosted: true,
        detail: NO_PLUGIN_LOADED,
      },
    ]);
  });
});
