// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// `hosted: true` loads a Producer Pal wrapper from Live's browser like any
// browser device, tells it which plug-in to load, and only then counts the
// device as created. A wrapper that can't be given its plug-in is deleted.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  type WrapperMessage,
  infoReply,
  installWrapper,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import { remoteScriptSetup } from "#src/tools/shared/remote-script/remote-script-setup.ts";
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

const EFFECT_ITEM = {
  type: "audio-effect",
  path: "query:UserLibrary#PPal Plug-in Effect.amxd",
  name: "PPal Plug-in Effect",
};
const INSTRUMENT_ITEM = {
  type: "instrument",
  path: "query:UserLibrary#PPal Plug-in Instrument.amxd",
  name: "PPal Plug-in Instrument",
};
const SERUM_FX = {
  name: "Serum 2 FX",
  vendor: "Xfer Records",
  category: "audio effect",
  format: "VST3",
  file: "/Library/Audio/Plug-Ins/VST3/Serum2.vst3",
  shared: true,
};
const SERUM = { ...SERUM_FX, name: "Serum 2", category: "instrument" };

let liveSet: RegisteredMockObject;
let track: RegisteredMockObject;
let tempTrack: RegisteredMockObject;
let loads = 0;

/**
 * Answer the node routes a hosted create uses: the plug-in database, and the
 * remote script's resolve and load. Each load lands a wrapper on the temp track.
 * @param options - How the routes answer
 * @param options.plugin - What the plug-in database says, or null for no match
 * @param options.item - What Live's browser has for the wrapper
 */
function answerNode(
  options: {
    plugin?: Record<string, unknown> | null;
    item?: Record<string, unknown>;
    resolution?: Record<string, unknown>;
  } = {},
): void {
  const { plugin = SERUM_FX, item = EFFECT_ITEM, resolution } = options;

  vi.mocked(requestNode).mockImplementation((route) => {
    if (route === "library.resolvePlugin") {
      return Promise.resolve(
        plugin == null
          ? { success: false, error: 'No plug-in named "Nope"' }
          : { success: true, result: plugin },
      );
    }

    if (route === REMOTE_SCRIPT_ROUTES.resolve) {
      return Promise.resolve({
        success: true,
        result: resolution ?? { available: true, item },
      });
    }

    const devices = tempTrack.properties.devices as unknown[];
    const id = `loaded-${++loads}`;

    registerMockObject(id, {
      path: TEMP_TRACK.device(devices.length / 2),
      type: "MaxDevice",
      properties: {
        class_name: "MxDeviceAudioEffect",
        type: 2,
        parameters: [],
      },
    });
    tempTrack.properties.devices = [...devices, "id", id];

    return Promise.resolve({ success: true, result: { available: true } });
  });
}

/**
 * Answer as a wrapper that loads its plug-in, or doesn't.
 * @param load - What it says to the load
 * @returns The requests it heard
 */
function wrapperLoads(load?: WrapperMessage): WrapperMessage[] {
  return installWrapper({
    info: () => infoReply("Serum 2 FX"),
    load: () => load ?? { success: true, plugin: "Serum 2 FX" },
    write: (request) => ({
      success: true,
      params: (request.params as unknown[]).map((_p, i) => ({
        ok: true,
        index: 206 + i,
        name: `Param ${i}`,
        value: 0.5,
        display: "1000",
      })),
    }),
  });
}

describe("createDevice hosted", () => {
  beforeEach(() => {
    loads = 0;
    vi.clearAllMocks();
    ({ liveSet, track } = registerTargetTrack());
    track.methods.delete_device = vi.fn();
    ({ tempTrack } = registerTempTrack(liveSet));
    registerMockObject("live_app", {
      path: "live_app",
      methods: { get_version_string: () => "12.4" },
    });
    answerNode();
  });

  it("loads the effect wrapper, then the plug-in into it", async () => {
    const heard = wrapperLoads();

    expect(
      await createDevice({
        device: "Serum 2 FX",
        hosted: true,
        path: "t0/d+",
      }),
    ).toStrictEqual({ id: "loaded-1", path: "t0/d1" });
    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.resolve,
      expect.objectContaining({ name: "PPal Plug-in Effect" }),
      expect.anything(),
    );
    expect(heard.filter((request) => request.op === "load")).toStrictEqual([
      {
        deviceId: "loaded-1",
        op: "load",
        format: "VST3",
        file: "Serum2",
        sub: "Serum 2 FX",
        name: "Serum 2 FX",
        synth: false,
      },
    ]);
  });

  it("uses the instrument wrapper for an instrument", async () => {
    answerNode({ plugin: SERUM, item: INSTRUMENT_ITEM });
    wrapperLoads();
    registerMockObject("loaded-1", {
      path: TEMP_TRACK.device(0),
      type: "MaxDevice",
      properties: { class_name: "MxDeviceInstrument", type: 1 },
    });

    await createDevice({ device: "Serum 2", hosted: true, path: "t0/d0" });

    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.resolve,
      expect.objectContaining({ name: "PPal Plug-in Instrument" }),
      expect.anything(),
    );
  });

  it("looks a plug-in up once however many paths want it", async () => {
    wrapperLoads();

    await createDevice({
      device: "Serum 2 FX",
      hosted: true,
      path: "t0/d+,t0/d+",
    });

    const lookups = vi
      .mocked(requestNode)
      .mock.calls.filter(([route]) => route === "library.resolvePlugin");

    expect(lookups).toHaveLength(1);
  });

  it("names the device and sets its params on the plug-in", async () => {
    const heard = wrapperLoads();
    const result = (await createDevice({
      device: "Serum 2 FX",
      hosted: true,
      path: "t0/d+",
      name: "My Fx",
      params: [{ name: "Filter 1 Freq", value: "1000" }],
    })) as { params?: unknown[] };

    expect(result.params).toStrictEqual([{ id: "h206", name: "Param 0" }]);
    expect(
      heard.filter((request) => request.op === "write"),
      "one request for the params",
    ).toHaveLength(1);
    expect(
      lookupSet("loaded-1"),
      "the user's name goes on after the plug-in loads",
    ).toHaveBeenLastCalledWith("name", "My Fx");
  });

  it("says its params may have landed when the plug-in never answers them", async () => {
    installWrapper({
      info: () => infoReply("Serum 2 FX"),
      load: () => ({ success: true }),
      write: () => ({
        success: false,
        error: "No plug-in host answered for device id loaded-1 (write)",
      }),
    });

    expect(
      await createDevice({
        device: "Serum 2 FX",
        hosted: true,
        path: "t0/d+",
        params: [{ name: "Filter 1 Freq", value: "1000" }],
      }),
    ).toStrictEqual({
      id: "loaded-1",
      path: "t0/d1",
      params: [
        {
          name: "Filter 1 Freq",
          ok: false,
          detail:
            "may have changed: the hosted plug-in didn't answer; read the device to check",
        },
      ],
    });
  });

  it("changes nothing when the name isn't a plug-in", async () => {
    answerNode({ plugin: null });
    wrapperLoads();

    await expect(
      createDevice({ device: "Nope", hosted: true, path: "t0/d+" }),
    ).rejects.toThrow('No plug-in named "Nope"');
    expect(liveSet.call).not.toHaveBeenCalledWith("create_midi_track", -1);
  });

  it("says the remote script is needed when it isn't answering", async () => {
    answerNode({ resolution: { available: false } });

    await expect(
      createDevice({ device: "Serum 2 FX", hosted: true, path: "t0/d+" }),
    ).rejects.toThrow(
      `can't host "Serum 2 FX": hosting needs the Producer Pal remote script, which isn't answering; ${remoteScriptSetup(true)}`,
    );
  });

  it("says when the remote script is out of date", async () => {
    answerNode({ resolution: { available: false, outdated: "running 2.4.0" } });

    await expect(
      createDevice({ device: "Serum 2 FX", hosted: true, path: "t0/d+" }),
    ).rejects.toThrow(
      `can't host "Serum 2 FX": the Producer Pal remote script is out of date: running 2.4.0`,
    );
  });

  it("refuses a preset with hosted, and hosted with nothing to host", async () => {
    await expect(
      createDevice({
        device: "Serum 2 FX",
        preset: "x",
        hosted: true,
        path: "t0/d+",
      }),
    ).rejects.toThrow("hosted can't be combined with preset");
    await expect(createDevice({ hosted: true })).rejects.toThrow(
      "hosted requires deviceName; omit it to list available devices",
    );
  });

  it("asks for a path before looking anything up", async () => {
    await expect(
      createDevice({ device: "Serum 2 FX", hosted: true }),
    ).rejects.toThrow("path is required when creating a device");
  });

  it("deletes the wrapper when the plug-in won't load, and skips the target", async () => {
    wrapperLoads({
      success: false,
      error: 'could not load "Serum 2 FX": nothing loaded from "Serum2"',
    });

    await expect(
      createDevice({ device: "Serum 2 FX", hosted: true, path: "t0/d+" }),
    ).rejects.toThrow(
      'could not load "Serum 2 FX": nothing loaded from "Serum2"',
    );
    expect(track.methods.delete_device).toHaveBeenCalledWith(1);
  });

  it("deletes the wrapper when the plug-in never answers", async () => {
    wrapperLoads({
      success: false,
      error: "No plug-in host answered for device id loaded-1 (load)",
    });

    await expect(
      createDevice({ device: "Serum 2 FX", hosted: true, path: "t0/d+" }),
    ).rejects.toThrow(
      'could not load "Serum 2 FX": it didn\'t finish loading in time',
    );
    expect(track.methods.delete_device).toHaveBeenCalledWith(1);
  });

  it("puts a wrapper's error under the plug-in's name when it has none", async () => {
    wrapperLoads({ success: false, error: "something broke" });

    await expect(
      createDevice({ device: "Serum 2 FX", hosted: true, path: "t0/d+" }),
    ).rejects.toThrow('could not load "Serum 2 FX": something broke');
  });

  it("keeps the other paths when one plug-in won't load", async () => {
    let asked = 0;

    installWrapper({
      info: () => infoReply("Serum 2 FX"),
      load: () =>
        ++asked === 1
          ? { success: false, error: 'could not load "Serum 2 FX": no' }
          : { success: true },
    });

    const result = await createDevice({
      device: "Serum 2 FX",
      hosted: true,
      path: "t0/d+,t0/d+",
    });

    expect(result).toStrictEqual([
      {
        path: "t0/d+",
        ok: false,
        detail: 'could not load "Serum 2 FX": no',
      },
      // The mock's delete_device removes nothing, so the first wrapper still
      // holds d1.
      { id: "loaded-2", path: "t0/d2" },
    ]);
  });

  it("keeps the wrapper's entry when it can't be deleted", async () => {
    wrapperLoads({ success: false, error: 'could not load "Serum 2 FX": no' });
    track.methods.delete_device = vi.fn(() => {
      throw new Error("Live said no");
    });

    expect(
      await createDevice({
        device: "Serum 2 FX",
        hosted: true,
        path: "t0/d+",
      }),
    ).toStrictEqual({
      id: "loaded-1",
      path: "t0/d1",
      detail:
        'could not load "Serum 2 FX": no; the empty wrapper device couldn\'t be deleted: Live said no; already changed: device created',
    });
  });

  it("deletes the wrapper when the request has no time left for the plug-in", async () => {
    wrapperLoads();

    const realNow = Date.now();
    const deadline = realNow + 60_000;

    const base = vi.mocked(requestNode).getMockImplementation();

    vi.mocked(requestNode).mockImplementation((route, ...rest) => {
      const answer = base?.(route, ...rest);

      if (route === REMOTE_SCRIPT_ROUTES.load) {
        vi.spyOn(Date, "now").mockReturnValue(deadline + 1);
      }

      return answer as ReturnType<typeof requestNode>;
    });

    try {
      await expect(
        createDevice(
          { device: "Serum 2 FX", hosted: true, path: "t0/d+" },
          { deadline },
        ),
      ).rejects.toThrow('could not load "Serum 2 FX"');
      expect(track.methods.delete_device).toHaveBeenCalledWith(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

/**
 * @param id - A registered mock's id
 * @returns Its `set` mock
 */
function lookupSet(id: string): ReturnType<typeof vi.fn> {
  return registerMockObject(id, {}).set as ReturnType<typeof vi.fn>;
}
