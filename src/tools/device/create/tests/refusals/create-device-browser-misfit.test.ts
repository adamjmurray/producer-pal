// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A browser device the place can't take is refused with the reason: before the
// load when its kind is known, after it when only the loaded device shows it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { mockWorkingDeviceMoves } from "#src/tools/device/update/tests/update-device-test-helpers.ts";
import { createDevice } from "../../create-device.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const TEMP_TRACK = livePath.track(1);
const REFUSED =
  'group track t0 (id group) takes only audio effects; "Pro-Q 4" ';

let liveSet: RegisteredMockObject;
let tempTrack: RegisteredMockObject;

/**
 * Answer the remote script with an item of the given type, whose load lands a
 * device on the temp track.
 * @param itemType - The item's `type`
 * @param deviceProperties - What the loaded device reports about itself
 */
function answerRemoteScript(
  itemType: string,
  deviceProperties: Record<string, unknown> = {},
): void {
  vi.mocked(requestNode).mockImplementation(async (route) => {
    if (route === REMOTE_SCRIPT_ROUTES.resolve) {
      return {
        success: true,
        result: {
          available: true,
          item: { type: itemType, path: "x/Pro-Q 4", name: "Pro-Q 4" },
        },
      };
    }

    registerMockObject("loaded", {
      path: TEMP_TRACK.device(0),
      properties: deviceProperties,
    });
    tempTrack.properties.devices = ["id", "loaded"];

    return { success: true, result: { available: true } };
  });
}

describe("createDevice — a browser device the place can't take", () => {
  beforeEach(() => {
    liveSet = mockWorkingDeviceMoves();
    liveSet.methods.create_midi_track = vi.fn(() => ["id", "temp-track"]);
    liveSet.methods.delete_track = vi.fn();
    registerMockObject("group", {
      path: livePath.track(0),
      type: "Track",
      properties: {
        devices: children("existing"),
        is_foldable: 1,
        has_midi_input: 0,
      },
    });
    registerMockObject("existing", { path: livePath.track(0).device(0) });
    tempTrack = registerMockObject("temp-track", {
      path: TEMP_TRACK,
      type: "Track",
      properties: { devices: [] },
    });
    registerMockObject("selected-track", { path: livePath.view.selectedTrack });
    registerMockObject("song-view", { path: livePath.view.song });
  });

  it("refuses an item of a known kind before loading it", async () => {
    answerRemoteScript("instrument");

    await expect(
      createDevice({ device: "Pro-Q 4", path: "t0/d+" }),
    ).rejects.toThrow(`${REFUSED}is an instrument`);
    expect(liveSet.methods.create_midi_track).not.toHaveBeenCalled();
    expect(requestNode).not.toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.load,
      expect.anything(),
      expect.anything(),
    );
  });

  it("names the kind a loaded plug-in turns out to be", async () => {
    liveSet.methods.move_device = () => null;
    answerRemoteScript("plugin", { type: 1, can_have_chains: 0 });

    await expect(
      createDevice({ device: "Pro-Q 4", path: "t0/d+" }),
    ).rejects.toThrow(`${REFUSED}is an instrument`);
    // The temp track is cleaned up whatever the reason.
    expect(liveSet.methods.delete_track).toHaveBeenCalledWith(1);
  });

  it("says the device may not fit when its kind can't be read", async () => {
    liveSet.methods.move_device = () => null;
    answerRemoteScript("plugin", { type: 0 });

    await expect(
      createDevice({ device: "Pro-Q 4", path: "t0/d+" }),
    ).rejects.toThrow(`${REFUSED}may not be an audio effect`);
  });

  it("leaves the refusal bare when the loaded device fits the place", async () => {
    liveSet.methods.move_device = () => null;
    answerRemoteScript("plugin", { type: 2, can_have_chains: 0 });

    await expect(
      createDevice({ device: "Pro-Q 4", path: "t0/d+" }),
    ).rejects.toThrow(/^could not insert "Pro-Q 4" at end in path "t0\/d\+"$/);
  });
});
