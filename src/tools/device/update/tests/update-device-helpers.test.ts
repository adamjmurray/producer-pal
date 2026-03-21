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
import {
  moveDrumChainToPath,
  updateMacroCount,
} from "../helpers/update-device-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("moveDrumChainToPath", () => {
  let chain: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("drumrack-id", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        can_have_drum_pads: 1,
        chains: children("chain-0"),
      },
    });

    chain = registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "DrumChain",
      properties: { in_note: 36 },
    });
  });

  it("should warn and skip when toPath has out-of-range note", () => {
    const chainApi = LiveAPI.from(chain.path);

    // G9 parses as a drum pad path but MIDI value (139) exceeds 127
    moveDrumChainToPath(chainApi, "t0/d0/pG9", false);

    expect(outlet).toHaveBeenCalledWith(1, 'invalid note "G9" in toPath');
    expect(chain.set).not.toHaveBeenCalled();
  });
});

describe("updateMacroCount", () => {
  let nonRackDevice: RegisteredMockObject;

  beforeEach(() => {
    nonRackDevice = registerMockObject("non-rack", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { can_have_chains: 0 },
    });
  });

  it("should warn and skip when device is not a rack", () => {
    const deviceApi = LiveAPI.from(nonRackDevice.path);

    updateMacroCount(deviceApi, 8);

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: macro count only available on rack devices",
    );
    expect(nonRackDevice.call).not.toHaveBeenCalled();
  });
});
