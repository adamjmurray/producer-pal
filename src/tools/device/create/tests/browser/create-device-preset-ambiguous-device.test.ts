// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A device name several devices have still loads a preset when exactly one
// preset turns up under them.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  type BrowserItem,
  type BrowserItemResolution,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { createBrowserDevice } from "../../helpers/browser-devices.ts";
import { createDevice } from "../../create-device.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

vi.mock(import("../../helpers/browser-devices.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  createBrowserDevice: vi.fn(),
}));

const AMBIGUOUS = 'deviceName "Tape" matches 2 devices';

const VST3_TAPE: BrowserItem = {
  type: "plugin",
  path: "VST3/Softube/Tape",
  name: "Tape",
};
const NATIVE_TAPE: BrowserItem = {
  type: "audio-effect",
  path: "Tape",
  name: "Tape",
};

const OXIDE: BrowserItem = {
  type: "file",
  path: "/Packs/Tape by Softube/Presets/Add Oxide.adv",
  name: "Add Oxide.adv",
};
const WARM: BrowserItem = {
  type: "audio-effect",
  path: "Tape/Add Oxide.adv",
  name: "Add Oxide.adv",
};

const MISSING: BrowserItemResolution = { available: true, error: "no preset" };

/**
 * Answer the device lookup as ambiguous, and each preset lookup by its scope.
 * @param byScope - What a preset lookup answers, keyed by its scope's type
 * @param candidates - The devices the name matched
 */
function answerLookups(
  byScope: Record<string, BrowserItemResolution>,
  candidates: BrowserItem[] = [VST3_TAPE, NATIVE_TAPE],
): void {
  vi.mocked(requestNode).mockImplementation(async (route, args) => {
    if (route !== REMOTE_SCRIPT_ROUTES.resolvePreset) {
      return {
        success: true,
        result: { available: true, error: AMBIGUOUS, candidates },
      };
    }

    const scope = (args as { scope?: { type: string } }).scope;

    return { success: true, result: byScope[scope?.type ?? ""] ?? MISSING };
  });
}

/** @returns How many preset lookups the tool made */
function presetLookupCount(): number {
  return vi
    .mocked(requestNode)
    .mock.calls.filter(
      ([route]) => route === REMOTE_SCRIPT_ROUTES.resolvePreset,
    ).length;
}

const CALL = { device: "Tape", preset: "Add Oxide", path: "t0/d+" };

describe("createDevice — a preset with a device name several devices have", () => {
  beforeEach(() => {
    registerMockObject("loaded", { path: livePath.track(0).device(0) });
    vi.mocked(createBrowserDevice).mockImplementation(
      async (_item, _device, _path, options) => {
        const created = {
          device: LiveAPI.from("loaded"),
          entry: { id: "loaded", path: "t0/d0" },
          written: { container: () => null, path: "t0" },
        };

        options?.onPlaced?.(created);

        return created;
      },
    );
  });

  it("loads the one preset found under one of them", async () => {
    answerLookups({ plugin: { available: true, item: OXIDE } });

    expect(await createDevice(CALL)).toStrictEqual({
      id: "loaded",
      path: "t0/d0",
    });
    expect(vi.mocked(createBrowserDevice).mock.calls[0]?.[0]).toStrictEqual(
      OXIDE,
    );
    expect(presetLookupCount()).toBe(2);
  });

  it("loads a preset every one of them finds", async () => {
    const found: BrowserItemResolution = { available: true, item: OXIDE };

    answerLookups({ plugin: found, "audio-effect": found });

    await createDevice(CALL);

    expect(vi.mocked(createBrowserDevice).mock.calls[0]?.[0]).toStrictEqual(
      OXIDE,
    );
  });

  it("refuses the name when they find different presets", async () => {
    answerLookups({
      plugin: { available: true, item: OXIDE },
      "audio-effect": { available: true, item: WARM },
    });

    await expect(createDevice(CALL)).rejects.toThrow(AMBIGUOUS);
    expect(createBrowserDevice).not.toHaveBeenCalled();
  });

  it("refuses the name when none of them has the preset", async () => {
    answerLookups({});

    await expect(createDevice(CALL)).rejects.toThrow(AMBIGUOUS);
    expect(createBrowserDevice).not.toHaveBeenCalled();
  });

  it("refuses the name without looking when it matches too many devices", async () => {
    answerLookups(
      {},
      Array.from({ length: 6 }, () => NATIVE_TAPE),
    );

    await expect(createDevice(CALL)).rejects.toThrow(AMBIGUOUS);
    expect(presetLookupCount()).toBe(0);
  });

  it("says the lookup ran out of time rather than refusing the name", async () => {
    let now = 1000;

    vi.spyOn(Date, "now").mockImplementation(() => now);
    answerLookups({});
    vi.mocked(requestNode).mockImplementationOnce(async () => ({
      success: true,
      result: {
        available: true,
        error: AMBIGUOUS,
        candidates: [VST3_TAPE, NATIVE_TAPE],
      },
    }));
    vi.mocked(requestNode).mockImplementationOnce(async () => {
      now += 60_000;

      return { success: false, error: "timed out" };
    });

    await expect(createDevice(CALL, { deadline: 30_000 })).rejects.toThrow(
      'could not look up preset "Add Oxide"',
    );
  });

  it("still refuses the name with no preset", async () => {
    answerLookups({});

    await expect(
      createDevice({ device: "Tape", path: "t0/d+" }),
    ).rejects.toThrow(AMBIGUOUS);
  });
});
