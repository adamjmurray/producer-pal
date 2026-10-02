// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A `preset` is looked up in Live's browser, among the named device's presets
// when there is one, and loads the way a plug-in does.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { PRESET_NEEDS_REMOTE_SCRIPT } from "#src/tools/device/create/helpers/browser-presets.ts";
import {
  type BrowserItem,
  type BrowserItemResolution,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { createBrowserDevice } from "../helpers/browser-devices.ts";
import { createDevice } from "../create-device.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

vi.mock(import("../helpers/browser-devices.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  createBrowserDevice: vi.fn(),
}));

const PRESET: BrowserItem = {
  type: "instrument",
  path: "Wavetable/Bass/Abdominal Bass.adv",
  name: "Abdominal Bass.adv",
};

const PLUGIN: BrowserItem = {
  type: "plugin",
  path: "VST3/Vital Audio/Vital",
  name: "Vital",
};

const FOUND_PRESET: BrowserItemResolution = { available: true, item: PRESET };
const FOUND_PLUGIN: BrowserItemResolution = { available: true, item: PLUGIN };

/**
 * Answer the remote script's lookups.
 * @param preset - What a preset lookup answers
 * @param device - What a device lookup answers
 */
function answerLookups(
  preset: BrowserItemResolution = FOUND_PRESET,
  device: BrowserItemResolution = FOUND_PLUGIN,
): void {
  vi.mocked(requestNode).mockImplementation(async (route) => ({
    success: true,
    result: route === REMOTE_SCRIPT_ROUTES.resolvePreset ? preset : device,
  }));
}

/**
 * The resolvePreset calls the tool made, by their args.
 * @returns Each call's args
 */
function presetLookups(): unknown[] {
  return vi
    .mocked(requestNode)
    .mock.calls.filter(
      ([route]) => route === REMOTE_SCRIPT_ROUTES.resolvePreset,
    )
    .map(([, args]) => args);
}

describe("createDevice — from a preset", () => {
  beforeEach(() => {
    answerLookups();
    registerMockObject("loaded", { path: livePath.track(0).device(0) });
    vi.mocked(createBrowserDevice).mockImplementation(async () => ({
      device: LiveAPI.from("loaded"),
      entry: { id: "loaded", path: "t0/d0" },
    }));
  });

  it("looks a name up among a native device's presets and loads it", async () => {
    expect(
      await createDevice({
        device: "Wavetable",
        preset: "Abdominal Bass",
        path: "t0/d+",
      }),
    ).toStrictEqual({ id: "loaded", path: "t0/d0" });

    expect(presetLookups()).toStrictEqual([
      {
        name: "Abdominal Bass",
        scope: { type: "instrument", path: "Wavetable", device: "Wavetable" },
      },
    ]);
    expect(createBrowserDevice).toHaveBeenCalledWith(
      PRESET,
      "Abdominal Bass",
      "t0/d+",
      expect.anything(),
    );
  });

  it("scopes to an audio effect's section", async () => {
    await createDevice({ device: "Reverb", preset: "Hall", path: "t0/d+" });

    expect(presetLookups()).toStrictEqual([
      {
        name: "Hall",
        scope: { type: "audio-effect", path: "Reverb", device: "Reverb" },
      },
    ]);
  });

  it("scopes to where Live's browser has a device that isn't native", async () => {
    await createDevice({ device: "Vital", preset: "Pad", path: "t0/d+" });

    expect(presetLookups()).toStrictEqual([
      {
        name: "Pad",
        scope: {
          type: "plugin",
          path: "VST3/Vital Audio/Vital",
          device: "Vital",
        },
      },
    ]);
  });

  it("searches every preset with no device", async () => {
    await createDevice({ preset: "Abdominal Bass", path: "t0/d+" });

    expect(presetLookups()).toStrictEqual([{ name: "Abdominal Bass" }]);
  });

  it("pairs a preset list with the paths, looking each name up once", async () => {
    await createDevice({
      device: "Wavetable",
      preset: "A,B,A",
      path: "t0/d+,t1/d+,t2/d+",
    });

    const scope = {
      type: "instrument",
      path: "Wavetable",
      device: "Wavetable",
    };

    expect(presetLookups()).toStrictEqual([
      { name: "A", scope },
      { name: "B", scope },
    ]);
    expect(createBrowserDevice).toHaveBeenCalledTimes(3);
  });

  it("refuses a preset list that doesn't match the paths", async () => {
    await expect(
      createDevice({ preset: "A,B,C", path: "t0/d+,t1/d+" }),
    ).rejects.toThrow("path names 2 entries but preset names 3 entries");
    expect(createBrowserDevice).not.toHaveBeenCalled();
  });

  it("refuses the call when a name matches no preset", async () => {
    answerLookups({ available: true, error: 'no preset "X"' });

    await expect(createDevice({ preset: "X", path: "t0/d+" })).rejects.toThrow(
      'no preset "X"',
    );
    expect(createBrowserDevice).not.toHaveBeenCalled();
  });

  it("says a preset needs the remote script when it isn't answering", async () => {
    answerLookups({ available: false });

    await expect(
      createDevice({ preset: "Abdominal Bass", path: "t0/d+" }),
    ).rejects.toThrow(PRESET_NEEDS_REMOTE_SCRIPT);
  });

  it("says the lookup failed when Node gives no answer", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error: "timed out",
    });

    await expect(
      createDevice({ preset: "Abdominal Bass", path: "t0/d+" }),
    ).rejects.toThrow('could not look up preset "Abdominal Bass": timed out');
  });

  it("looks nothing up once the request is out of time", async () => {
    await expect(
      createDevice(
        { preset: "Abdominal Bass", path: "t0/d+" },
        { deadline: Date.now() - 1 },
      ),
    ).rejects.toThrow("the request ran out of time; nothing changed");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("still needs a path", async () => {
    await expect(createDevice({ preset: "Abdominal Bass" })).rejects.toThrow(
      "path is required when creating a device",
    );
    expect(requestNode).not.toHaveBeenCalled();
  });
});
