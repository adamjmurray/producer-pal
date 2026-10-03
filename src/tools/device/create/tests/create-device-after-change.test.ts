// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A call's targets fail on their own. A path that can't be parsed refuses the
// call; one that can't be applied skips its target; a throw after the device
// went in keeps the device's entry, with a detail for what didn't happen.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { mockWorkingDeviceMoves } from "#src/tools/device/update/tests/update-device-test-helpers.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  hookCalls,
  registerTracks,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { createDevice } from "../create-device.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

const APPENDS = "t0/d+,t0/d+,t0/d+";
const DEVICES = "Reverb,Delay,Compressor";
const LANDED = `${LIVE_FAILURE}; already changed: device created`;

/**
 * Make the nth device a track takes refuse its name.
 * @param track - The track
 * @param nth - Which insert, counting from 1
 */
function refuseNameOfDevice(track: RegisteredMockObject, nth: number): void {
  hookCalls(track, /^insert_device$/, {
    after: (count, _args, result) => {
      if (count === nth) {
        failOnSet(
          lookupMockObject(
            String((result as string[])[1]),
          ) as RegisteredMockObject,
          "name",
        );
      }
    },
  });
}

describe("createDevice — a path that can't be parsed", () => {
  it("refuses the whole call, creating nothing", async () => {
    const [track] = registerTracks(1) as [RegisteredMockObject];

    await expect(
      createDevice({ device: "Reverb", path: "t0/d+,not-a-path,t0/d+" }),
    ).rejects.toThrow('invalid path "not-a-path"');

    expect(track.call).not.toHaveBeenCalled();
  });
});

describe("createDevice — a legacy path spelling", () => {
  it("warns as often as the write parses it, not once more for the check", async () => {
    const { warn } = await import("#src/shared/max/v8-max-console.ts");

    registerTracks(1);
    vi.mocked(warn).mockClear();

    await createDevice({ device: "Reverb", path: "0" });

    expect(
      vi
        .mocked(warn)
        .mock.calls.filter(([message]) =>
          String(message).includes("bare track index"),
        ),
    ).toHaveLength(2);
  });
});

describe("createDevice — a path that names nothing", () => {
  it("skips only its own target", async () => {
    const [track] = registerTracks(1) as [RegisteredMockObject];

    mockNonExistentObjects();

    expect(
      await createDevice({ device: "Reverb", path: "t0/d+,t9/d+,t0/d+" }),
    ).toStrictEqual([
      { id: expect.any(String), path: "t0/d0" },
      {
        path: "t9/d+",
        ok: false,
        detail: 'container at path "t9/d+" does not exist',
      },
      { id: expect.any(String), path: "t0/d1" },
    ]);
    expect(track.call).toHaveBeenCalledTimes(2);
  });
});

describe("createDevice — a later insert shifts an earlier device", () => {
  it("names each device where it is after the call", async () => {
    const [track] = registerTracks(1) as [RegisteredMockObject];
    let first: RegisteredMockObject | undefined;

    // Live puts the second device ahead of the first, so the first moves down.
    hookCalls(track, /^insert_device$/, {
      after: (nth, _args, result) => {
        const made = lookupMockObject(String((result as string[])[1]));

        if (nth === 1) {
          first = made;
        }

        if (nth === 2 && first != null) {
          first.path = livePath.track(0).device(1).toString();
        }
      },
    });

    expect(
      await createDevice({ device: "Reverb,Delay", path: "t0/d+,t0/d+" }),
    ).toStrictEqual([
      { id: expect.any(String), path: "t0/d1" },
      { id: expect.any(String), path: "t0/d1" },
    ]);
  });
});

describe("createDevice — a throw after a native insert", () => {
  it("keeps the device's entry and says what didn't happen", async () => {
    const [track] = registerTracks(1) as [RegisteredMockObject];

    refuseNameOfDevice(track, 2);

    const result = (await createDevice({
      device: DEVICES,
      path: APPENDS,
      name: "A,B,C",
    })) as object[];

    expect(result).toStrictEqual([
      { id: expect.any(String), path: "t0/d0" },
      // No `ok`: the device is in the Set, only its name didn't take.
      { id: expect.any(String), path: "t0/d1", detail: LANDED },
      { id: expect.any(String), path: "t0/d2" },
    ]);
    expect(result[1]).not.toHaveProperty("ok");
  });

  it("stops at the deadline, leaving later targets skipped", async () => {
    const [track] = registerTracks(1) as [RegisteredMockObject];
    const start = 1_000_000;
    let now = start;

    vi.spyOn(Date, "now").mockImplementation(() => now);
    // The first insert uses up the time.
    hookCalls(track, /^insert_device$/, { after: () => (now = start + 5000) });

    expect(
      await createDevice(
        { device: DEVICES, path: APPENDS },
        { deadline: start + 1000 },
      ),
    ).toStrictEqual([
      { id: expect.any(String), path: "t0/d0" },
      {
        path: "t0/d+",
        ok: false,
        detail: "the request ran out of time; re-run for this path",
      },
      {
        path: "t0/d+",
        ok: false,
        detail: "the request ran out of time; re-run for this path",
      },
    ]);
    expect(track.call).toHaveBeenCalledTimes(1);
  });
});

describe("createDevice — a throw after a browser load", () => {
  const ITEM = { type: "plugin", path: "VST3/Pro-Q 4", name: "Pro-Q 4" };
  const PRESET = { type: "preset", path: "Presets/Warm", name: "Warm" };
  const TEMP_TRACK = livePath.track(1);
  let liveSet: RegisteredMockObject;
  let tempTrack: RegisteredMockObject;
  let loads = 0;
  let onLoaded: ((loaded: RegisteredMockObject) => void) | undefined;

  beforeEach(() => {
    loads = 0;
    onLoaded = undefined;
    liveSet = mockWorkingDeviceMoves();
    liveSet.methods.create_midi_track = () => ["id", "temp-track"];
    // The first temp track won't go; later ones do.
    liveSet.methods.delete_track = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error(LIVE_FAILURE);
      })
      .mockImplementation(() => undefined);
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children() },
    });
    tempTrack = registerMockObject("temp-track", {
      path: TEMP_TRACK,
      type: "Track",
      properties: { devices: [] },
    });
    registerMockObject("selected-track", { path: livePath.view.selectedTrack });
    registerMockObject("song-view", { path: livePath.view.song });
    vi.mocked(requestNode).mockImplementation(async (route) => {
      if (route === REMOTE_SCRIPT_ROUTES.resolve) {
        return { success: true, result: { available: true, item: ITEM } };
      }

      if (route === REMOTE_SCRIPT_ROUTES.resolvePreset) {
        return { success: true, result: { available: true, item: PRESET } };
      }

      const devices = tempTrack.properties.devices as unknown[];
      const id = `loaded-${++loads}`;

      const loaded = registerMockObject(id, {
        path: TEMP_TRACK.device(devices.length / 2),
      });

      onLoaded?.(loaded);
      tempTrack.properties.devices = [...devices, "id", id];

      return { success: true, result: { available: true } };
    });
  });

  it("keeps the device's entry when the temp track won't go", async () => {
    const result = (await createDevice({
      device: "Pro-Q 4",
      path: "t0/d+,t0/d+",
    })) as object[];

    expect(result).toStrictEqual([
      // In place before the cleanup threw: its entry, not a skip, and no
      // chains-left claim.
      { id: "loaded-1", path: "t0/d0", detail: LANDED },
      { id: "loaded-2", path: "t0/d1" },
    ]);
    expect(result[0]).not.toHaveProperty("ok");
  });

  it("does the same for a device loaded from a preset", async () => {
    const result = (await createDevice({
      preset: "Warm",
      path: "t0/d+,t0/d+",
    })) as object[];

    expect(result).toStrictEqual([
      { id: "loaded-1", path: "t0/d0", detail: LANDED },
      { id: "loaded-2", path: "t0/d1" },
    ]);
  });

  it("keeps the device's entry when its name then won't take", async () => {
    onLoaded = (loaded) => failOnSet(loaded, "name");
    liveSet.methods.delete_track = vi.fn();

    expect(
      await createDevice({ device: "Pro-Q 4", path: "t0/d+", name: "EQ" }),
    ).toStrictEqual({ id: "loaded-1", path: "t0/d0", detail: LANDED });
  });

  it("names it and sets its params before the temp track goes", async () => {
    const result = await createDevice({
      device: "Pro-Q 4",
      path: "t0/d+",
      name: "EQ",
      params: [{ name: "Nope", value: "1" }],
    });

    expect(lookupMockObject("loaded-1")?.set).toHaveBeenCalledWith(
      "name",
      "EQ",
    );
    expect(result).toStrictEqual({
      id: "loaded-1",
      path: "t0/d0",
      params: [{ name: "Nope", ok: false, detail: expect.any(String) }],
      detail: `${LIVE_FAILURE}; already changed: device created, name, params`,
    });
  });

  it("keeps the chains it made, and doesn't call them empty", async () => {
    const chainIds: string[] = [];
    const rack = livePath.track(0).device(0);

    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children("rack") },
    });
    registerMockObject("rack", {
      path: rack,
      type: "RackDevice",
      properties: {
        chains: chainIds,
        can_have_chains: 1,
        can_have_drum_pads: 0,
      },
      methods: {
        insert_chain: () => {
          const index = chainIds.length / 2;
          const id = `chain-${index}`;

          registerMockObject(id, {
            path: rack.chain(index),
            type: "Chain",
            properties: { devices: children() },
          });
          chainIds.push("id", id);

          return ["id", id];
        },
      },
    });

    const result = await createDevice({ device: "Pro-Q 4", path: "t0/d0/c1" });

    expect(result).toStrictEqual({
      id: "loaded-1",
      path: "t0/d0/c1/d0",
      created: "c0-c1",
      detail: LANDED,
    });
  });
});
