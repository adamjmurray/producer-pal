// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A `preset` loads onto each target device through the remote script before
// the rest of the update runs on whatever device is there afterwards.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  type BrowserItem,
  type BrowserItemHotswap,
  type BrowserItemResolution,
  REMOTE_SCRIPT_EXPIRY_MARGIN_MS,
  REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { updateDeviceWithPreset } from "../update-device-with-preset.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const PRESET: BrowserItem = {
  type: "instrument",
  path: "Drift/Bass/AG Bass.adv",
  name: "AG Bass.adv",
};
const DRIFT_PATH = livePath.track(3).device(0);
const REVERB_PATH = livePath.track(3).device(1);

let drift: RegisteredMockObject;

interface Answers {
  resolution?: BrowserItemResolution;
  /** What each hotswap answers, in order; the last repeats */
  hotswaps?: BrowserItemHotswap[];
  /** Runs as a hotswap answers, for a device Live puts in the old one's place */
  onHotswap?: (devicePath: string) => void;
}

/**
 * Answer the remote script's routes.
 * @param answers - What each route answers
 */
function answerRemoteScript({
  resolution = { available: true, item: PRESET },
  hotswaps = [{ available: true, replaced: false }],
  onHotswap,
}: Answers = {}): void {
  let swaps = 0;

  vi.mocked(requestNode).mockImplementation(async (route, args) => {
    if (route === REMOTE_SCRIPT_ROUTES.resolvePreset) {
      return { success: true, result: resolution };
    }

    onHotswap?.((args as { devicePath: string }).devicePath);

    return {
      success: true,
      result: hotswaps[Math.min(swaps++, hotswaps.length - 1)],
    };
  });
}

/**
 * The calls the tool made to one route, by their args.
 * @param route - The route
 * @returns Each call's args
 */
function callsTo(route: string): unknown[] {
  return vi
    .mocked(requestNode)
    .mock.calls.filter(([called]) => called === route)
    .map(([, args]) => args);
}

/**
 * The scope a preset name is searched in for a device in the Set.
 * @param type - The device's section
 * @param device - Its browser name
 * @returns The scope
 */
function targetScope(type: string, device: string): object {
  return { type, path: device, device, orAnywhere: true };
}

/**
 * Register a device.
 * @param id - Its id
 * @param path - Where it sits
 * @param properties - Its class, kind and name
 * @returns The mock
 */
function registerDevice(
  id: string,
  path: string,
  properties: Record<string, unknown>,
): RegisteredMockObject {
  return registerMockObject(id, { path, type: "Device", properties });
}

describe("updateDeviceWithPreset", () => {
  beforeEach(() => {
    drift = registerDevice("drift", String(DRIFT_PATH), {
      class_display_name: "Drift",
      type: 1,
      name: "Drift",
    });
    registerDevice("reverb", String(REVERB_PATH), {
      class_display_name: "Reverb",
      type: 2,
      name: "Reverb",
    });
    answerRemoteScript();
  });

  it("runs an update with no preset as it always has, with nothing to await", () => {
    const result = updateDeviceWithPreset({ path: "t3/d0", name: "Lead" });

    expect(result).toStrictEqual({ id: "drift", path: "t3/d0" });
    expect(drift.set).toHaveBeenCalledWith("name", "Lead");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("loads the preset onto the device, searching its own presets first", async () => {
    expect(
      await updateDeviceWithPreset({ path: "t3/d0", preset: "AG Bass" }),
    ).toStrictEqual({ id: "drift", path: "t3/d0" });

    expect(callsTo(REMOTE_SCRIPT_ROUTES.resolvePreset)).toStrictEqual([
      {
        name: "AG Bass",
        scope: {
          type: "instrument",
          path: "Drift",
          device: "Drift",
          orAnywhere: true,
        },
      },
    ]);
    expect(callsTo(REMOTE_SCRIPT_ROUTES.hotswap)).toStrictEqual([
      {
        type: "instrument",
        path: "Drift/Bass/AG Bass.adv",
        devicePath: String(DRIFT_PATH),
        deviceName: "Drift",
        expiresInMs:
          REMOTE_SCRIPT_REQUEST_TIMEOUT_MS - REMOTE_SCRIPT_EXPIRY_MARGIN_MS,
      },
    ]);
  });

  // Live skips a hotswap still queued at its expiry, so one V8 stopped waiting
  // for and reported as not loaded never lands later.
  it.each([
    { left: 10_000, expiresInMs: 8000 },
    { left: 3000, expiresInMs: 1500 },
  ])(
    "expires the hotswap before V8 stops waiting, with $left ms left",
    async ({ left, expiresInMs }) => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_000);

      await updateDeviceWithPreset(
        { path: "t3/d0", preset: "AG Bass" },
        { deadline: 1_000_000 + left },
      );

      expect(requestNode).toHaveBeenCalledWith(
        REMOTE_SCRIPT_ROUTES.hotswap,
        expect.objectContaining({ expiresInMs }),
        left,
      );
    },
  );

  it("names the new device, and says so, when Live replaced it", async () => {
    answerRemoteScript({
      hotswaps: [{ available: true, replaced: true }],
      onHotswap: (path) => registerDevice("rack", path, { name: "Rack" }),
    });

    expect(
      await updateDeviceWithPreset({ id: "drift", preset: "808 Drifter" }),
    ).toStrictEqual({
      id: "rack",
      path: "t3/d0",
      detail:
        "the preset replaced the device with a new one (new id); any automation on the old device is gone",
    });
  });

  it("runs the rest of the update on the new device", async () => {
    let rack: RegisteredMockObject | undefined;

    answerRemoteScript({
      hotswaps: [{ available: true, replaced: true }],
      onHotswap: (path) => {
        rack = registerDevice("rack", path, { name: "Rack" });
      },
    });

    await updateDeviceWithPreset({ id: "drift", preset: "X", name: "Keys" });

    expect(rack?.set).toHaveBeenCalledWith("name", "Keys");
    expect(drift.set).not.toHaveBeenCalledWith("name", "Keys");
  });

  it("skips a lone target whose preset didn't load", async () => {
    answerRemoteScript({
      hotswaps: [{ available: true, error: "kinds differ" }],
    });

    await expect(
      updateDeviceWithPreset({ path: "t3/d0", preset: "Concert Hall" }),
    ).rejects.toThrow("preset not loaded: kinds differ");
  });

  it("still applies the rest of the update when the preset didn't load", async () => {
    answerRemoteScript({
      hotswaps: [{ available: true, error: "kinds differ" }],
    });

    expect(
      await updateDeviceWithPreset({
        path: "t3/d0",
        preset: "Concert Hall",
        name: "Lead",
      }),
    ).toStrictEqual({
      id: "drift",
      path: "t3/d0",
      detail: "preset not loaded: kinds differ",
    });
    expect(drift.set).toHaveBeenCalledWith("name", "Lead");
  });

  it("pairs a preset list with the targets, looking a name up once per device kind", async () => {
    registerDevice("drift2", String(livePath.track(4).device(0)), {
      class_display_name: "Drift",
      type: 1,
      name: "Drift",
    });

    await updateDeviceWithPreset({
      path: "t3/d0,t4/d0,t3/d1",
      preset: "AG Bass,AG Bass,Concert Hall",
    });

    expect(callsTo(REMOTE_SCRIPT_ROUTES.resolvePreset)).toStrictEqual([
      { name: "AG Bass", scope: targetScope("instrument", "Drift") },
      { name: "Concert Hall", scope: targetScope("audio-effect", "Reverb") },
    ]);
    expect(callsTo(REMOTE_SCRIPT_ROUTES.hotswap)).toHaveLength(3);
  });

  it("refuses the call before loading anything when a name matches no preset", async () => {
    answerRemoteScript({
      resolution: { available: true, error: 'no preset "X"' },
    });

    await expect(
      updateDeviceWithPreset({ path: "t3/d0", preset: "X" }),
    ).rejects.toThrow('no preset "X"');
    expect(callsTo(REMOTE_SCRIPT_ROUTES.hotswap)).toHaveLength(0);
  });

  it("refuses a bad call before loading anything", async () => {
    await expect(
      updateDeviceWithPreset({ path: "t3/d0,t3/d1", preset: "A,B,C" }),
    ).rejects.toThrow("preset names 3 entries");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("refuses a preset with wrapInRack", async () => {
    await expect(
      updateDeviceWithPreset({
        path: "t3/d0",
        preset: "AG Bass",
        wrapInRack: true,
      }),
    ).rejects.toThrow("wrapInRack cannot be used with preset");
  });

  it("loads nothing onto a chain", async () => {
    registerMockObject("chain", {
      path: String(livePath.track(3).device(0).chain(0)),
      type: "Chain",
    });

    await expect(
      updateDeviceWithPreset({ path: "t3/d0/c0", preset: "AG Bass" }),
    ).rejects.toThrow("preset not applicable to a chain");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("loads nothing onto the Producer Pal device", async () => {
    registerMockObject("this_device", { path: String(DRIFT_PATH) });

    await expect(
      updateDeviceWithPreset({ path: "t3/d0", preset: "AG Bass" }),
    ).rejects.toThrow("the Producer Pal device can't load a preset");
    expect(callsTo(REMOTE_SCRIPT_ROUTES.hotswap)).toHaveLength(0);
  });

  it("says why when the remote script gives no answer", async () => {
    vi.mocked(requestNode).mockImplementation(async (route) =>
      route === REMOTE_SCRIPT_ROUTES.resolvePreset
        ? { success: true, result: { available: true, item: PRESET } }
        : { success: false, error: "timed out" },
    );

    await expect(
      updateDeviceWithPreset({ path: "t3/d0", preset: "AG Bass" }),
    ).rejects.toThrow("preset not loaded: timed out");
  });

  it("says the preset needs the remote script when it stopped answering", async () => {
    answerRemoteScript({ hotswaps: [{ available: false }] });

    await expect(
      updateDeviceWithPreset({ path: "t3/d0", preset: "AG Bass" }),
    ).rejects.toThrow("needs the Producer Pal remote script");
  });

  it("loads nothing once the request is out of time", async () => {
    await expect(
      updateDeviceWithPreset(
        { path: "t3/d0", preset: "AG Bass" },
        { deadline: Date.now() - 1 },
      ),
    ).rejects.toThrow("the request ran out of time");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("reports a target that names nothing", async () => {
    mockNonExistentObjects();

    expect(
      await updateDeviceWithPreset({ path: "t3/d0,t9/d0", preset: "AG Bass" }),
    ).toStrictEqual([
      { id: "drift", path: "t3/d0" },
      expect.objectContaining({ ok: false }),
    ]);
  });
});
