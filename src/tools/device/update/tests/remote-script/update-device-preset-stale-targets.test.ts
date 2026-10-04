// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A preset can replace a rack, which kills the devices inside it. Targets of
// the same call that sat inside it answer for themselves.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  deleteMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  type BrowserItem,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { updateDevice } from "../../update-device.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const PRESET: BrowserItem = {
  type: "instrument",
  path: "Instrument Rack/Pad.adg",
  name: "Pad.adg",
};
const RACK_PATH = String(livePath.track(3).device(0));
const NESTED_PATH = String(livePath.track(3).device(0).chain(0).device(0));

const CHAIN_PATH = String(livePath.track(3).device(0).chain(0));

const GONE =
  "no longer exists: an earlier target in this call replaced it or its rack";

/** @returns The args of each hotswap request made */
function hotswapCalls(): unknown[] {
  return vi
    .mocked(requestNode)
    .mock.calls.filter(([route]) => route === REMOTE_SCRIPT_ROUTES.hotswap);
}

/** Answer the remote script; every hotswap replaces the rack with a new one. */
function replaceRackOnHotswap(): void {
  vi.mocked(requestNode).mockImplementation(async (route, args) => {
    if (route === REMOTE_SCRIPT_ROUTES.resolvePreset) {
      return { success: true, result: { available: true, item: PRESET } };
    }

    const { devicePath } = args as { devicePath: string };

    // Live removes the old rack, and with it everything inside it.
    deleteMockObject(devicePath);
    deleteMockObject(NESTED_PATH);
    deleteMockObject(CHAIN_PATH);
    registerMockObject("newRack", {
      path: devicePath,
      type: "Device",
      properties: { class_display_name: "Instrument Rack", type: 1 },
    });

    return { success: true, result: { available: true, replaced: true } };
  });
}

describe("updateDevice - targets gone by their turn", () => {
  let nested: RegisteredMockObject;
  let chain: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("rack", {
      path: RACK_PATH,
      type: "Device",
      properties: {
        class_display_name: "Instrument Rack",
        type: 1,
        name: "Rack",
      },
    });
    chain = registerMockObject("chain", {
      path: CHAIN_PATH,
      type: "Chain",
    });
    nested = registerMockObject("nested", {
      path: NESTED_PATH,
      type: "Device",
      properties: { class_display_name: "Drift", type: 1, name: "Drift" },
    });
    replaceRackOnHotswap();
  });

  it("skips a device inside a rack an earlier target replaced, and says why", async () => {
    expect(
      await updateDevice({ path: "t3/d0,t3/d0/c0/d0", preset: "Pad,Pad" }),
    ).toStrictEqual([
      expect.objectContaining({ id: "newRack" }),
      { path: "t3/d0/c0/d0", ok: false, detail: GONE },
    ]);
    expect(hotswapCalls()).toHaveLength(1);
  });

  it("skips a target with no preset of its own too, writing nothing to it", async () => {
    expect(
      await updateDevice({
        path: "t3/d0,t3/d0/c0/d0",
        preset: "Pad",
        name: "A,B",
      }),
    ).toStrictEqual([
      expect.objectContaining({ id: "newRack" }),
      { path: "t3/d0/c0/d0", ok: false, detail: GONE },
    ]);
    expect(nested.set).not.toHaveBeenCalled();
  });

  it("skips a chain inside a rack an earlier target replaced", async () => {
    expect(
      await updateDevice({
        path: "t3/d0,t3/d0/c0",
        preset: "Pad",
        name: "A,B",
      }),
    ).toStrictEqual([
      expect.objectContaining({ id: "newRack" }),
      { path: "t3/d0/c0", ok: false, detail: GONE },
    ]);
    expect(chain.set).not.toHaveBeenCalled();
  });

  it("writes to a target an earlier target only shifted", async () => {
    vi.mocked(requestNode).mockImplementation(async (route) => {
      if (route === REMOTE_SCRIPT_ROUTES.resolvePreset) {
        return { success: true, result: { available: true, item: PRESET } };
      }

      // A device slid up a slot: same object, new path.
      registerMockObject("nested", {
        path: String(livePath.track(3).device(0).chain(0).device(1)),
      });

      return { success: true, result: { available: true, replaced: false } };
    });

    expect(
      await updateDevice({
        path: "t3/d0,t3/d0/c0/d0",
        preset: "Pad",
        name: "A,B",
      }),
    ).toStrictEqual([
      { id: "rack", path: "t3/d0" },
      { id: "nested", path: "t3/d0/c0/d1" },
    ]);
    expect(nested.set).toHaveBeenCalledWith("name", "B");
  });

  it("names the target by its id when the call did", async () => {
    expect(
      await updateDevice({ ids: "rack,nested", preset: "Pad,Pad" }),
    ).toStrictEqual([
      expect.objectContaining({ id: "newRack" }),
      { id: "nested", ok: false, detail: GONE },
    ]);
  });

  it("loads only the later of a device named twice", async () => {
    expect(
      await updateDevice({ path: "t3/d0,t3/d0", preset: "Pad,Pad" }),
    ).toStrictEqual([
      { path: "t3/d0", detail: 'named again as "t3/d0" later in this call' },
      expect.objectContaining({ id: "newRack" }),
    ]);
    expect(hotswapCalls()).toHaveLength(1);
  });
});

describe("updateDevice - after a refused preset removed a device", () => {
  const SLOT = String(livePath.track(3).device(0));
  const NEXT_SLOT = String(livePath.track(3).device(1));
  const REFUSED = "the preset contains the Producer Pal device";

  beforeEach(() => {
    for (const [id, path] of [
      ["first", SLOT],
      ["second", NEXT_SLOT],
    ] as const) {
      registerMockObject(id, {
        path,
        type: "Device",
        properties: { class_display_name: "Reverb", type: 2, name: id },
      });
    }
  });

  it("loads the next target at the path it has now", async () => {
    let swaps = 0;

    const refusal = {
      available: true as const,
      error: REFUSED,
      changed: true as const,
    };
    const done = { available: true as const, replaced: false };

    vi.mocked(requestNode).mockImplementation(async (route) => {
      if (route === REMOTE_SCRIPT_ROUTES.resolvePreset) {
        return { success: true, result: { available: true, item: PRESET } };
      }

      if (swaps++ > 0) {
        return { success: true, result: done };
      }

      // Live loses the first device, and the second slides into its slot.
      deleteMockObject(SLOT);
      registerMockObject("second", { path: SLOT });

      return { success: true, result: refusal };
    });

    expect(
      await updateDevice({ ids: "first,second", preset: "Pad,Pad" }),
    ).toStrictEqual([
      {
        path: "t3/d0",
        detail: `preset not loaded: ${REFUSED}; already changed: the device was replaced and removed; its slot is empty`,
      },
      { id: "second", path: "t3/d0" },
    ]);
    expect(hotswapCalls()).toHaveLength(2);
    expect(vi.mocked(requestNode).mock.calls.at(-1)?.[1]).toStrictEqual(
      expect.objectContaining({ devicePath: SLOT }),
    );
  });
});
