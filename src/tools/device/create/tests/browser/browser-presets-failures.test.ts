// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// How a preset lookup or hotswap reports a remote script that fails, says
// nothing, or runs out of time.

import { afterEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { lookupOutOfTime } from "#src/tools/device/create/helpers/browser-devices.ts";
import {
  hotswapPreset,
  presetScopeForDevice,
  resolveBrowserPreset,
} from "#src/tools/device/create/helpers/browser-presets.ts";
import {
  type BrowserItem,
  REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { unreachedDetail } from "#src/tools/shared/validation/lists/named-targets.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const PRESET: BrowserItem = {
  type: "instrument",
  path: "Drift/Bass/AG Bass.adv",
  name: "AG Bass.adv",
};

const OUT_OF_TIME = `could not look up preset "AG Bass": ${lookupOutOfTime("nothing changed")}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveBrowserPreset", () => {
  it("says the lookup ran out of time when V8 stopped waiting for it", async () => {
    let now = 1000;

    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.mocked(requestNode).mockImplementation(async () => {
      now += REMOTE_SCRIPT_REQUEST_TIMEOUT_MS;

      return { success: false, error: "timed out" };
    });

    await expect(
      resolveBrowserPreset("AG Bass", undefined, null),
    ).rejects.toThrow(OUT_OF_TIME);
  });

  it("says the lookup ran out of time when the search did", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: {
        available: true,
        error: "search took too long",
        outOfTime: true,
      },
    });

    await expect(
      resolveBrowserPreset("AG Bass", undefined, null),
    ).rejects.toThrow(OUT_OF_TIME);
  });

  it("says there was no answer when a failure gives no reason", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false });

    await expect(
      resolveBrowserPreset("AG Bass", undefined, null),
    ).rejects.toThrow('could not look up preset "AG Bass": no answer');
  });
});

describe("hotswapPreset", () => {
  const device = (): LiveAPI => {
    registerMockObject("drift", {
      path: livePath.track(0).device(0),
      properties: { name: "Drift" },
    });

    return LiveAPI.from("drift");
  };

  it("sends nothing once the request is out of time", async () => {
    const result = await hotswapPreset(device(), PRESET, Date.now() - 1);

    expect(result).toStrictEqual({ error: unreachedDetail("target") });
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("says the remote script returned nothing when a failure gives no reason", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false });

    expect(await hotswapPreset(device(), PRESET, null)).toStrictEqual({
      error: "the remote script returned nothing",
    });
  });
});

describe("hotswapPreset after Live changed the device", () => {
  it("passes on that the device changed", async () => {
    registerMockObject("drift", {
      path: livePath.track(0).device(0),
      properties: { name: "Drift" },
    });
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, error: "slot is now empty", changed: true },
    });

    expect(
      await hotswapPreset(LiveAPI.from("drift"), PRESET, null),
    ).toStrictEqual({ error: "slot is now empty", changed: true });
  });
});

describe("presetScopeForDevice", () => {
  it("searches instruments for a name that is no native device", () => {
    expect(presetScopeForDevice("Not A Device", null)).toStrictEqual({
      type: "instrument",
      path: "Not A Device",
      device: "Not A Device",
    });
  });
});
