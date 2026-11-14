// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A Producer Pal wrapper created by its browser name, with no plug-in in it,
// takes none of the call's `params`: every entry says why, and the device is
// still created. Any other Max device takes its params as usual.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { installCapturingTask } from "#src/live-api-adapter/protocols/tests/v8-protocol-test-helpers.ts";
import { WRAPPER_SILENT } from "#src/tools/device/update/helpers/call/hosted-params.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  type WrapperMessage,
  infoReply,
  installWrapper,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import {
  NO_PLUGIN_LOADED,
  PLUGIN_NOT_LOADED,
} from "#src/tools/shared/device/helpers/params/hosted-plugin-reading.ts";
import { waitForWrapper } from "../../helpers/call/wait-for-wrapper.ts";
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

const WRAPPER_ITEM = {
  type: "audio-effect",
  path: "query:UserLibrary#PPal Plug-in Effect.amxd",
  name: "PPal Plug-in Effect",
};

const OTHER_MAX_ITEM = {
  type: "mfl-device",
  path: "query:UserLibrary#Some Max Device.amxd",
  name: "Some Max Device",
};

const DIDNT_ANSWER =
  "may have changed: the hosted plug-in didn't answer; read the device to check";

let liveSet: RegisteredMockObject;
let tempTrack: RegisteredMockObject;
let slotDial: RegisteredMockObject;

/** A reply the bus never gets: the wrapper isn't up yet. */
const SILENT = undefined as unknown as WrapperMessage;

/** @returns How many temp tracks have been deleted so far */
const tempTracksDeleted = (): number =>
  vi.mocked(liveSet.methods.delete_track as () => void).mock.calls.length;

/**
 * Land a Max device on the temp track whenever the remote script loads one. It
 * has a slot dial ("Automation 001") the way a wrapper does.
 */
function answerNode(item: Record<string, unknown> = WRAPPER_ITEM): void {
  vi.mocked(requestNode).mockImplementation((route) => {
    if (route === REMOTE_SCRIPT_ROUTES.resolve) {
      return Promise.resolve({
        success: true,
        result: { available: true, item },
      });
    }

    const devices = tempTrack.properties.devices as unknown[];

    registerMockObject("loaded-1", {
      path: TEMP_TRACK.device(devices.length / 2),
      type: "MaxDevice",
      properties: {
        class_name: "MxDeviceAudioEffect",
        type: 2,
        parameters: children("slot-dial"),
      },
    });
    tempTrack.properties.devices = [...devices, "id", "loaded-1"];

    return Promise.resolve({ success: true, result: { available: true } });
  });
}

/**
 * @param params - The params to set on the new wrapper
 * @param extra - Other call fields
 * @returns What createDevice answers for a wrapper placed at t0/d+
 */
function createWrapper(
  params: Array<{ name: string; value: string }>,
  extra: Record<string, unknown> = {},
): ReturnType<typeof createDevice> {
  return createDevice({
    deviceName: "PPal Plug-in Effect",
    path: "t0/d+",
    ...extra,
    params,
  });
}

/**
 * Create a wrapper with "Cutoff" set, stalled on its wrapper's wait, and run
 * `during` once that wait has started.
 * @param during - Gets `timeOut` (fires the wait's timeout) and the pending call
 */
async function withWrapperWaitStalled(
  during: (
    timeOut: () => void,
    pending: ReturnType<typeof createWrapper>,
  ) => Promise<void>,
): Promise<void> {
  const callbacks: Array<() => void> = [];
  const restore = installCapturingTask(callbacks);

  installWrapper({ info: () => infoReply("Serum 2 FX") });

  try {
    const pending = createWrapper([{ name: "Cutoff", value: "1000" }]);

    await vi.waitFor(() => expect(callbacks.length).toBeGreaterThan(0));
    await during(() => callbacks.at(-1)?.(), pending);
  } finally {
    restore();
  }
}

describe("createDevice - a Producer Pal wrapper made by its browser name", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    ({ liveSet } = registerTargetTrack());
    ({ tempTrack } = registerTempTrack(liveSet));
    slotDial = registerMockObject("slot-dial", {
      properties: {
        name: "Automation 001",
        original_name: "Automation 001",
        is_quantized: 0,
        is_enabled: 1,
        state: 0,
        value: 0,
        min: 0,
        max: 1,
        canonical_parent: children("loaded-1"),
      },
      methods: { str_for_value: (value: unknown) => String(value) },
    });
    answerNode();
  });

  it.each([
    ["has no plug-in", infoReply(null), NO_PLUGIN_LOADED],
    ["has lost its plug-in", infoReply(null, "Serum 2"), PLUGIN_NOT_LOADED],
  ])(
    "creates the device and refuses every param when it %s",
    async (_case, info, reason) => {
      const heard = installWrapper({ info: () => info });

      expect(
        await createWrapper([
          { name: "Cutoff", value: "1000" },
          { name: "Automation 001", value: "0.5" },
        ]),
      ).toStrictEqual({
        id: "loaded-1",
        path: "t0/d1",
        params: [
          { name: "Cutoff", ok: false, detail: reason },
          { name: "Automation 001", ok: false, detail: reason },
        ],
      });
      expect(
        slotDial.set,
        "the wrapper's own slot dial is not written",
      ).not.toHaveBeenCalled();
      expect(heard.some((request) => request.op === "write")).toBe(false);
    },
  );

  it("still names the device it created", async () => {
    installWrapper({ info: () => infoReply(null) });

    await createWrapper([{ name: "Cutoff", value: "1000" }], { name: "My Fx" });

    expect(
      registerMockObject("loaded-1", {}).set,
      "named once the params are settled",
    ).toHaveBeenCalledWith("name", "My Fx");
  });

  it("says its params may have landed when the wrapper never answers", async () => {
    installWrapper({
      info: () => infoReply("Serum 2 FX"),
      write: () => ({
        success: false,
        error: "No plug-in host answered for device id loaded-1 (write)",
      }),
    });

    expect(
      await createWrapper([{ name: "Cutoff", value: "1000" }]),
    ).toStrictEqual({
      id: "loaded-1",
      path: "t0/d1",
      params: [
        {
          name: "Cutoff",
          ok: false,
          detail: DIDNT_ANSWER,
        },
      ],
    });
  });

  it("keeps the device and says what changed when the wrapper write throws", async () => {
    installWrapper({
      info: () => infoReply("Serum 2 FX"),
      write: () => {
        throw new Error("bus broke");
      },
    });

    const result = await createWrapper([{ name: "Cutoff", value: "1000" }], {
      name: "My Fx",
    });

    expect(result).toStrictEqual({
      id: "loaded-1",
      path: "t0/d1",
      detail: expect.stringContaining("already changed: device created"),
    });
  });

  it("keeps the device when the wrapper's answer times out", async () => {
    await withWrapperWaitStalled(async (timeOut, pending) => {
      timeOut();

      expect(await pending).toStrictEqual({
        id: "loaded-1",
        path: "t0/d1",
        params: [
          {
            name: "Cutoff",
            ok: false,
            detail: DIDNT_ANSWER,
          },
        ],
      });
    });
  });

  it("waits for a wrapper that isn't up yet, then refuses by its answer", async () => {
    let probes = 0;
    const heard = installWrapper({
      info: () => (++probes < 4 ? SILENT : infoReply(null)),
    });

    const result = (await createWrapper([
      { name: "Automation 001", value: "0.5" },
    ])) as { params: unknown[] };

    expect(probes).toBeGreaterThan(3);
    expect(result.params).toStrictEqual([
      { name: "Automation 001", ok: false, detail: NO_PLUGIN_LOADED },
    ]);
    expect(slotDial.set).not.toHaveBeenCalled();
    expect(heard.some((request) => request.op === "write")).toBe(false);
  });

  it("refuses every param of a wrapper that never answers, leaving its own dials", async () => {
    installWrapper({});

    expect(
      await createWrapper(
        [
          { name: "Cutoff", value: "1000" },
          { name: "Automation 001", value: "0.5" },
        ],
        { name: "My Fx" },
      ),
    ).toStrictEqual({
      id: "loaded-1",
      path: "t0/d1",
      params: [
        { name: "Cutoff", ok: false, detail: WRAPPER_SILENT },
        { name: "Automation 001", ok: false, detail: WRAPPER_SILENT },
      ],
    });
    expect(slotDial.set).not.toHaveBeenCalledWith("value", expect.anything());
    expect(registerMockObject("loaded-1", {}).set).toHaveBeenCalledWith(
      "name",
      "My Fx",
    );
  });

  it("asks a wrapper once when the request has no time left to wait", async () => {
    let probes = 0;

    installWrapper({
      info: () => {
        probes++;

        return SILENT;
      },
    });

    expect(await waitForWrapper("loaded-1", Date.now() - 1)).toBe(false);
    expect(probes).toBe(1);
  });

  it("waits and writes only after the temp track is gone", async () => {
    const deletedAt: Record<string, number> = {};

    installWrapper({
      info: () => {
        deletedAt.info ??= tempTracksDeleted();

        return infoReply("Serum 2 FX");
      },
      write: (request) => {
        deletedAt.write = tempTracksDeleted();

        return {
          success: true,
          params: (request.params as unknown[]).map(() => ({
            ok: true,
            index: 1,
            name: "Cutoff",
            display: "1000",
          })),
        };
      },
    });

    await createWrapper([{ name: "Cutoff", value: "1000" }]);

    expect(deletedAt).toStrictEqual({ info: 1, write: 1 });
  });

  it("has removed the temp track already when the wrapper's write times out", async () => {
    await withWrapperWaitStalled(async (timeOut, pending) => {
      expect(tempTracksDeleted(), "gone while the write waits").toBe(1);
      timeOut();
      await pending;
      expect(tempTracksDeleted(), "and still gone after").toBe(1);
    });
  });

  describe("a Max device that isn't a wrapper", () => {
    it("takes its params as any device's, as soon as it is placed", async () => {
      answerNode(OTHER_MAX_ITEM);
      installWrapper({});

      const result = (await createDevice({
        deviceName: "Some Max Device",
        path: "t0/d+",
        params: [{ name: "Automation 001", value: "0.5" }],
      })) as { params: unknown[] };

      expect(slotDial.set).toHaveBeenCalledWith("value", 0.5);
      expect(result.params).toStrictEqual([
        { id: "slot-dial", name: "Automation 001" },
      ]);
      expect(
        vi.mocked(slotDial.set).mock.invocationCallOrder[0],
        "before the temp track is cleaned up",
      ).toBeLessThan(
        vi.mocked(liveSet.methods.delete_track as () => void).mock
          .invocationCallOrder[0] as number,
      );
    });
  });
});
