// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A deviceName Live has no native device for loads from Live's browser through
// the remote script: onto a temp track, then moved to the path.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  type BrowserItemLoad,
  type BrowserItemResolution,
  REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { mockWorkingDeviceMoves } from "#src/tools/device/update/tests/update-device-test-helpers.ts";
import { createDevice } from "../create-device.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const ITEM = {
  type: "plugin",
  path: "VST3/FabFilter/Pro-Q 4",
  name: "Pro-Q 4",
};
const TEMP_TRACK = livePath.track(1);

let liveSet: RegisteredMockObject;
let track: RegisteredMockObject;
let tempTrack: RegisteredMockObject;
let songView: RegisteredMockObject;
let loads = 0;

interface RemoteScriptAnswers {
  resolution?: BrowserItemResolution;
  /** The load route's whole response */
  load?: { success: boolean; result?: BrowserItemLoad; error?: string };
  /** Whether the loaded device shows up on the temp track */
  arrives?: boolean;
  /** Whether the device that arrives reads as an instrument */
  instrument?: boolean;
  /** Runs once the device has landed, for state that changes mid-request */
  afterLoad?: () => void;
}

/**
 * Answer the remote script's routes, landing each load on the temp track as a
 * new device.
 * @param answers - What each route answers
 */
function answerRemoteScript({
  resolution = { available: true, item: ITEM },
  load = { success: true, result: { available: true } },
  arrives = true,
  instrument = false,
  afterLoad,
}: RemoteScriptAnswers = {}): void {
  vi.mocked(requestNode).mockImplementation(async (route) => {
    if (route === REMOTE_SCRIPT_ROUTES.resolve) {
      return { success: true, result: resolution };
    }

    if (arrives) {
      const devices = tempTrack.properties.devices as unknown[];
      const id = `loaded-${++loads}`;

      registerMockObject(id, {
        path: TEMP_TRACK.device(devices.length / 2),
        ...(instrument
          ? { properties: { type: 1, can_have_chains: 0 } }
          : undefined),
      });
      tempTrack.properties.devices = [...devices, "id", id];
      afterLoad?.();
    }

    return load;
  });
}

/**
 * Assert the temp track was deleted and the selection put back.
 * @param times - How many temp tracks the call made
 */
function expectCleanedUp(times = 1): void {
  expect(liveSet.methods.delete_track).toHaveBeenCalledTimes(times);
  expect(liveSet.methods.delete_track).toHaveBeenCalledWith(1);
  expect(songView.set).toHaveBeenCalledWith(
    "selected_track",
    "id selected-track",
  );
}

describe("createDevice — a plug-in or Max for Live device", () => {
  beforeEach(() => {
    loads = 0;
    liveSet = mockWorkingDeviceMoves();
    liveSet.methods.create_midi_track = () => ["id", "temp-track"];
    liveSet.methods.delete_track = vi.fn();
    track = registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children("existing") },
    });
    registerMockObject("existing", { path: livePath.track(0).device(0) });
    tempTrack = registerMockObject("temp-track", {
      path: TEMP_TRACK,
      type: "Track",
      properties: { devices: [] },
    });
    registerMockObject("selected-track", { path: livePath.view.selectedTrack });
    songView = registerMockObject("song-view", { path: livePath.view.song });
    answerRemoteScript();
  });

  it("loads it onto a temp track and moves it to the path", async () => {
    expect(
      await createDevice({ deviceName: "Pro-Q 4", path: "t0/d+" }),
    ).toStrictEqual({ id: "loaded-1", path: "t0/d1" });

    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.resolve,
      { name: "Pro-Q 4" },
      REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
    );
    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.load,
      { type: "plugin", path: "VST3/FabFilter/Pro-Q 4", trackIndex: 1 },
      REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
    );
    expect(liveSet.call).toHaveBeenCalledWith("create_midi_track", -1);
    expect(track.properties.devices).toStrictEqual(
      children("existing", "loaded-1"),
    );
    expectCleanedUp();
  });

  it("inserts at the position the path names", async () => {
    expect(
      await createDevice({ deviceName: "Pro-Q 4", path: "t0/d0" }),
    ).toStrictEqual({ id: "loaded-1", path: "t0/d0" });
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id loaded-1",
      "id track-0",
      0,
    );
  });

  it("appends past the end of the chain, warning like a native insert", async () => {
    expect(
      await createDevice({ deviceName: "Pro-Q 4", path: "t0/d5" }),
    ).toStrictEqual({ id: "loaded-1", path: "t0/d1" });
    expect(capturedWarnings()).toStrictEqual([
      'path "t0/d5" is past the end of the device chain (1 device), appending "Pro-Q 4" instead',
    ]);
  });

  it("finds the loaded device among ones a default track preset put there", async () => {
    tempTrack.properties.devices = children("preset");
    registerMockObject("preset", { path: TEMP_TRACK.device(0) });

    expect(
      await createDevice({ deviceName: "Pro-Q 4", path: "t0/d+" }),
    ).toStrictEqual({ id: "loaded-1", path: "t0/d1" });
  });

  it("names the device and applies params", async () => {
    const result = (await createDevice({
      deviceName: "Pro-Q 4",
      path: "t0/d+",
      name: "Main EQ",
      params: [{ name: "Nope", value: "1" }],
    })) as { params?: unknown[] };

    expect(lookupMockObject("loaded-1")?.set).toHaveBeenCalledWith(
      "name",
      "Main EQ",
    );
    expect(result.params).toHaveLength(1);
  });

  it("creates one per path, skipping a path that fails and warning why", async () => {
    mockNonExistentObjects();

    expect(
      await createDevice({ deviceName: "Pro-Q 4", path: "t0/d+,t9/d+" }),
    ).toStrictEqual({ id: "loaded-1", path: "t0/d1" });
    expect(capturedWarnings()).toStrictEqual([
      'Failed to create "Pro-Q 4" at path "t9/d+": container at path "t9/d+" does not exist',
    ]);
    // The bad path fails before it makes a temp track.
    expectCleanedUp(1);
  });

  it("answers the native invalid deviceName error when the remote script isn't running", async () => {
    answerRemoteScript({ resolution: { available: false } });

    await expect(
      createDevice({ deviceName: "Pro-Q 4", path: "t0" }),
    ).rejects.toThrow(/^invalid deviceName "Pro-Q 4"\. Valid devices - /);
    // Ahead of the path check, as it always was.
    await expect(createDevice({ deviceName: "Pro-Q 4" })).rejects.toThrow(
      /^invalid deviceName "Pro-Q 4"\. Valid devices - /,
    );
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("passes a lookup's error through, touching nothing", async () => {
    const error = 'deviceName "Pro" matches 2 devices; pass one of these';

    answerRemoteScript({ resolution: { available: true, error } });

    await expect(
      createDevice({ deviceName: "Pro", path: "t0" }),
    ).rejects.toThrow(error);
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("says when the lookup got no answer", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error: "timed out",
    });

    await expect(
      createDevice({ deviceName: "Pro-Q 4", path: "t0" }),
    ).rejects.toThrow(
      `could not look up "Pro-Q 4" in Live's browser: timed out`,
    );
  });

  it("says so when the lookup fails without saying why", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false });

    await expect(
      createDevice({ deviceName: "Pro-Q 4", path: "t0" }),
    ).rejects.toThrow(
      `could not look up "Pro-Q 4" in Live's browser: no answer`,
    );
  });

  it("refuses when Live makes no track to load onto", async () => {
    liveSet.methods.create_midi_track = () => ["id", "0"];

    await expect(
      createDevice({ deviceName: "Pro-Q 4", path: "t0" }),
    ).rejects.toThrow(`could not load "Pro-Q 4": Live made no track`);
    expect(requestNode).toHaveBeenCalledTimes(1);
  });

  describe("refuses to load a second Producer Pal", () => {
    const REFUSAL =
      "cannot create the Producer Pal device: it is already running in this " +
      "Set, and a second copy would break the connection this tool runs on";

    it.each([
      ["by name", "Producer_Pal", "Max Audio Effect/Producer_Pal"],
      ["by a name still carrying .amxd", "producer_pal.amxd", "User Library"],
      ["by the file it sits at", "My Pal", "User Library/Producer_Pal.amxd"],
    ])("%s", async (_case, name, path) => {
      answerRemoteScript({
        resolution: {
          available: true,
          item: { type: "mfl-device", path, name },
        },
      });

      await expect(
        createDevice({ deviceName: name, path: "t0/d+" }),
      ).rejects.toThrow(REFUSAL);
      expect(liveSet.call).not.toHaveBeenCalled();
    });

    it("still loads another Max for Live device", async () => {
      answerRemoteScript({
        resolution: {
          available: true,
          item: {
            type: "mfl-device",
            path: "Max Audio Effect/LFO.amxd",
            name: "LFO",
          },
        },
      });

      expect(
        await createDevice({ deviceName: "LFO", path: "t0/d+" }),
      ).toStrictEqual({ id: "loaded-1", path: "t0/d1" });
    });
  });

  describe("always deletes the temp track", () => {
    it("when the load fails", async () => {
      answerRemoteScript({
        load: {
          success: true,
          result: { available: true, error: "no 'Pro-Q 4' in VST3" },
        },
        arrives: false,
      });

      await expect(
        createDevice({ deviceName: "Pro-Q 4", path: "t0" }),
      ).rejects.toThrow(`could not load "Pro-Q 4": no 'Pro-Q 4' in VST3`);
      expectCleanedUp();
    });

    it("when the remote script stops answering", async () => {
      answerRemoteScript({
        load: { success: true, result: { available: false } },
        arrives: false,
      });

      await expect(
        createDevice({ deviceName: "Pro-Q 4", path: "t0" }),
      ).rejects.toThrow(
        `could not load "Pro-Q 4": Live's browser stopped answering`,
      );
      expectCleanedUp();
    });

    it("when the load returns nothing", async () => {
      answerRemoteScript({ load: { success: true }, arrives: false });

      await expect(
        createDevice({ deviceName: "Pro-Q 4", path: "t0" }),
      ).rejects.toThrow(
        `could not load "Pro-Q 4": the remote script returned nothing`,
      );
      expectCleanedUp();
    });

    it("when the load gets no answer", async () => {
      answerRemoteScript({
        load: { success: false, error: "timed out" },
        arrives: false,
      });

      await expect(
        createDevice({ deviceName: "Pro-Q 4", path: "t0" }),
      ).rejects.toThrow(`could not load "Pro-Q 4": timed out`);
      expectCleanedUp();
    });

    it("when the device never arrives", async () => {
      answerRemoteScript({ arrives: false });

      await expect(
        createDevice({ deviceName: "Pro-Q 4", path: "t0" }),
      ).rejects.toThrow(`could not load "Pro-Q 4": it never arrived`);
      expectCleanedUp();
    });

    it("when Live drops the move", async () => {
      liveSet.methods.move_device = () => null;

      await expect(
        createDevice({ deviceName: "Pro-Q 4", path: "t0/d+" }),
      ).rejects.toThrow(`could not insert "Pro-Q 4" at end in path "t0/d+"`);
      expectCleanedUp();
    });

    it("naming why Live dropped it, when the move says", async () => {
      // A second instrument on one track: the refusal carries a reason, and
      // the caller gets it rather than a bare "could not insert".
      liveSet.methods.move_device = () => null;
      registerMockObject("existing", {
        path: livePath.track(0).device(0),
        properties: { type: 1, can_have_chains: 0 },
      });
      answerRemoteScript({ instrument: true });

      await expect(
        createDevice({ deviceName: "Pro-Q 4", path: "t0/d+" }),
      ).rejects.toThrow(
        `could not insert "Pro-Q 4" at end in path "t0/d+": the destination ` +
          `already has an instrument, and only one is allowed`,
      );
      expectCleanedUp();
    });
  });

  describe("cleans up what it can", () => {
    it("leaves the selection alone when Live named no selected track", async () => {
      mockNonExistentObjects();
      // No object at the view path, so Live's "nothing is selected" id.
      registerMockObject("0", { path: livePath.view.selectedTrack });

      await createDevice({ deviceName: "Pro-Q 4", path: "t0/d+" });

      expect(liveSet.methods.delete_track).toHaveBeenCalledWith(1);
      expect(songView.set).not.toHaveBeenCalledWith(
        "selected_track",
        expect.anything(),
      );
    });

    it("deletes no track when the temp track is already gone", async () => {
      // The index is read at cleanup time, not at creation: another request
      // may have removed the track while this one waited on the browser.
      const dropTempTrack = () => {
        tempTrack.path = "";
      };

      answerRemoteScript({ afterLoad: dropTempTrack });

      await createDevice({ deviceName: "Pro-Q 4", path: "t0/d+" });

      expect(liveSet.methods.delete_track).not.toHaveBeenCalled();
      expect(songView.set).toHaveBeenCalledWith(
        "selected_track",
        "id selected-track",
      );
    });
  });
});
