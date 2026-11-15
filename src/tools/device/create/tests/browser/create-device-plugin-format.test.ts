// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A plug-in loaded from Live's browser (not hosted) says which format it
// loaded in. A browser path picks the format; the lookup, not the tool, reads it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import {
  type BrowserItem,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "../../create-device.ts";
import {
  registerTargetTrack,
  registerTempTrack,
  TEMP_TRACK,
} from "./temp-track-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const PRO_Q = {
  type: "plugin",
  path: "VST3/FabFilter/Pro-Q 4",
  name: "Pro-Q 4",
  format: "VST3",
  vendor: "FabFilter",
} as const satisfies BrowserItem;

let tempTrack: ReturnType<typeof registerTempTrack>["tempTrack"];
let loads = 0;

/**
 * Answer the remote script: the lookup finds `item`, and each load lands a
 * device on the temp track.
 * @param item - What the lookup finds
 */
function lookupFinds(item: BrowserItem): void {
  vi.mocked(requestNode).mockImplementation((route) => {
    if (route === REMOTE_SCRIPT_ROUTES.resolve) {
      return Promise.resolve({
        success: true,
        result: { available: true, item },
      });
    }

    const devices = tempTrack.properties.devices as unknown[];
    const id = `loaded-${++loads}`;

    registerMockObject(id, { path: TEMP_TRACK.device(devices.length / 2) });
    tempTrack.properties.devices = [...devices, "id", id];

    return Promise.resolve({ success: true, result: { available: true } });
  });
}

describe("createDevice — the format a plug-in loaded in", () => {
  beforeEach(() => {
    loads = 0;

    const { liveSet } = registerTargetTrack();

    ({ tempTrack } = registerTempTrack(liveSet));
    lookupFinds(PRO_Q);
  });

  it("reports it for a bare name", async () => {
    expect(
      await createDevice({ device: "Pro-Q 4", path: "t0/d+" }),
    ).toStrictEqual({
      id: "loaded-1",
      path: "t0/d1",
      format: "VST3",
      vendor: "FabFilter",
    });
  });

  it("hands a browser path to the lookup as it is, and reports the format it found", async () => {
    const name = "Plug-Ins/AU/FabFilter/Pro-Q 4";

    lookupFinds({
      ...PRO_Q,
      path: "AUv2/FabFilter/Pro-Q 4",
      format: "AU",
    });

    expect(await createDevice({ device: name, path: "t0/d+" })).toStrictEqual({
      id: "loaded-1",
      path: "t0/d1",
      format: "AU",
      vendor: "FabFilter",
    });
    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.resolve,
      expect.objectContaining({ name }),
      expect.anything(),
    );
    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.load,
      expect.objectContaining({ path: "AUv2/FabFilter/Pro-Q 4" }),
      expect.anything(),
    );
  });

  it("says nothing of a vendor for a plug-in with no maker's folder", async () => {
    lookupFinds({
      type: "plugin",
      path: "VST/Pro-Q 4",
      name: "Pro-Q 4",
      format: "VST",
    });

    expect(
      await createDevice({ device: "Pro-Q 4", path: "t0/d+" }),
    ).toStrictEqual({ id: "loaded-1", path: "t0/d1", format: "VST" });
  });

  it("says nothing of a format for a device that isn't a plug-in", async () => {
    lookupFinds({
      type: "mfl-device",
      path: "Max Audio Effect/LFO.amxd",
      name: "LFO",
    });

    expect(await createDevice({ device: "LFO", path: "t0/d+" })).toStrictEqual({
      id: "loaded-1",
      path: "t0/d1",
    });
  });

  it("keeps the format on the entry when a later step throws", async () => {
    const answer = vi.mocked(requestNode).getMockImplementation();

    vi.mocked(requestNode).mockImplementation((...args) => {
      const reply = answer?.(...args);

      if (args[0] === REMOTE_SCRIPT_ROUTES.load) {
        registerMockObject("loaded-1", {
          path: TEMP_TRACK.device(0),
        }).set.mockImplementation(() => {
          throw new Error("Live said no");
        });
      }

      return reply as ReturnType<typeof requestNode>;
    });

    expect(
      await createDevice({ device: "Pro-Q 4", path: "t0/d+", name: "EQ" }),
    ).toStrictEqual({
      id: "loaded-1",
      path: "t0/d1",
      format: "VST3",
      vendor: "FabFilter",
      detail: "Live said no; already changed: device created",
    });
  });
});
