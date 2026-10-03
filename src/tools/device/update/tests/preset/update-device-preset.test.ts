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
import { updateDevice } from "../../update-device.ts";

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

describe("updateDevice with a preset", () => {
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
    const result = updateDevice({ path: "t3/d0", name: "Lead" });

    expect(result).toStrictEqual({ id: "drift", path: "t3/d0" });
    expect(drift.set).toHaveBeenCalledWith("name", "Lead");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("loads the preset onto the device, searching its own presets first", async () => {
    expect(
      await updateDevice({ path: "t3/d0", preset: "AG Bass" }),
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

      await updateDevice(
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
      await updateDevice({ id: "drift", preset: "808 Drifter" }),
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

    await updateDevice({ id: "drift", preset: "X", name: "Keys" });

    expect(rack?.set).toHaveBeenCalledWith("name", "Keys");
    expect(drift.set).not.toHaveBeenCalledWith("name", "Keys");
  });

  it("skips a lone target whose preset didn't load", async () => {
    answerRemoteScript({
      hotswaps: [{ available: true, error: "kinds differ" }],
    });

    await expect(
      updateDevice({ path: "t3/d0", preset: "Concert Hall" }),
    ).rejects.toThrow("preset not loaded: kinds differ");
  });

  it("still applies the rest of the update when the preset didn't load", async () => {
    answerRemoteScript({
      hotswaps: [{ available: true, error: "kinds differ" }],
    });

    expect(
      await updateDevice({
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

    await updateDevice({
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

    await expect(updateDevice({ path: "t3/d0", preset: "X" })).rejects.toThrow(
      'no preset "X"',
    );
    expect(callsTo(REMOTE_SCRIPT_ROUTES.hotswap)).toHaveLength(0);
  });

  it("refuses a bad call before loading anything", () => {
    expect(() =>
      updateDevice({ path: "t3/d0,t3/d1", preset: "A,B,C" }),
    ).toThrow("preset names 3 entries");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("refuses a preset with wrapInRack", () => {
    expect(() =>
      updateDevice({
        path: "t3/d0",
        preset: "AG Bass",
        wrapInRack: true,
      }),
    ).toThrow("wrapInRack cannot be used with preset");
  });

  it("loads nothing onto a chain", async () => {
    registerMockObject("chain", {
      path: String(livePath.track(3).device(0).chain(0)),
      type: "Chain",
    });

    await expect(
      updateDevice({ path: "t3/d0/c0", preset: "AG Bass" }),
    ).rejects.toThrow("preset not applicable to a chain");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("loads nothing onto the Producer Pal device", async () => {
    registerMockObject("this_device", { path: String(DRIFT_PATH) });

    await expect(
      updateDevice({ path: "t3/d0", preset: "AG Bass" }),
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
      updateDevice({ path: "t3/d0", preset: "AG Bass" }),
    ).rejects.toThrow("preset not loaded: timed out");
  });

  it("says the preset needs the remote script when it stopped answering", async () => {
    answerRemoteScript({ hotswaps: [{ available: false }] });

    await expect(
      updateDevice({ path: "t3/d0", preset: "AG Bass" }),
    ).rejects.toThrow("needs the Producer Pal remote script");
  });

  it("loads nothing once the request is out of time", async () => {
    await expect(
      updateDevice(
        { path: "t3/d0", preset: "AG Bass" },
        { deadline: Date.now() - 1 },
      ),
    ).rejects.toThrow("the request ran out of time");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("reports a target that names nothing", async () => {
    mockNonExistentObjects();

    expect(
      await updateDevice({ path: "t3/d0,t9/d0", preset: "AG Bass" }),
    ).toStrictEqual([
      { id: "drift", path: "t3/d0" },
      expect.objectContaining({ ok: false }),
    ]);
  });
});

describe("updateDevice - Live fails around a preset load", () => {
  const REFUSED = "Live refused the write";

  /**
   * Make a device refuse to be written to, as Live does.
   * @param mock - The device
   */
  function refuseWrites(mock: RegisteredMockObject): void {
    mock.set.mockImplementation(() => {
      throw new Error(REFUSED);
    });
  }

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

  it("keeps a lone target's entry once its preset landed, and names the preset", async () => {
    refuseWrites(drift);

    const result = await updateDevice({
      path: "t3/d0",
      preset: "AG Bass",
      name: "Lead",
    });

    expect(result).toStrictEqual({
      id: "drift",
      path: "t3/d0",
      detail: `${REFUSED}; already changed: preset`,
    });
  });

  it("names the new device when the preset replaced it before the failure", async () => {
    answerRemoteScript({
      hotswaps: [{ available: true, replaced: true }],
      onHotswap: (path) => {
        refuseWrites(registerDevice("rack", path, { name: "Rack" }));
      },
    });

    expect(
      await updateDevice({ id: "drift", preset: "X", name: "Keys" }),
    ).toStrictEqual({
      id: "rack",
      path: "t3/d0",
      detail: `${REFUSED}; already changed: preset`,
    });
  });

  it("writes the targets after one that failed, loading each preset", async () => {
    refuseWrites(drift);

    expect(
      await updateDevice({
        path: "t3/d0,t3/d1",
        preset: "AG Bass,Concert Hall",
        name: "A,B",
      }),
    ).toStrictEqual([
      {
        id: "drift",
        path: "t3/d0",
        detail: `${REFUSED}; already changed: preset`,
      },
      { id: "reverb", path: "t3/d1" },
    ]);
    expect(callsTo(REMOTE_SCRIPT_ROUTES.hotswap)).toHaveLength(2);
  });

  it("fails a lone target whose preset never loaded and whose write then threw", async () => {
    answerRemoteScript({
      hotswaps: [{ available: true, error: "kinds differ" }],
    });
    refuseWrites(drift);

    await expect(
      updateDevice({ path: "t3/d0", preset: "Concert Hall", name: "Lead" }),
    ).rejects.toThrow(REFUSED);
  });

  it("gives a target whose preset never loaded and whose write then threw a skip", async () => {
    answerRemoteScript({
      hotswaps: [{ available: true, error: "kinds differ" }],
    });
    refuseWrites(drift);

    expect(
      await updateDevice({
        path: "t3/d0,t3/d1",
        preset: "Concert Hall,Concert Hall",
        name: "A,B",
      }),
    ).toStrictEqual([
      { path: "t3/d0", ok: false, detail: REFUSED },
      {
        id: "reverb",
        path: "t3/d1",
        detail: "preset not loaded: kinds differ",
      },
    ]);
  });

  it("gives a target whose load threw a skip, and loads the next", async () => {
    let swaps = 0;

    vi.mocked(requestNode).mockImplementation(async (route) => {
      if (route === REMOTE_SCRIPT_ROUTES.resolvePreset) {
        return { success: true, result: { available: true, item: PRESET } };
      }

      if (swaps++ === 0) {
        throw new Error("socket closed");
      }

      return { success: true, result: { available: true, replaced: false } };
    });

    expect(
      await updateDevice({
        path: "t3/d0,t3/d1",
        preset: "AG Bass,Concert Hall",
      }),
    ).toStrictEqual([
      { path: "t3/d0", ok: false, detail: "socket closed" },
      { id: "reverb", path: "t3/d1" },
    ]);
  });
});
