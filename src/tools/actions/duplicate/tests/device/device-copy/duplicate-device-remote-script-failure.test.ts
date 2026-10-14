// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A device copy made by Live that then can't be placed, or whose answer never
// came, must not leave a stray beside the original without saying so.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  mockNonExistentObjects,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

vi.mock(import("#src/tools/device/update/helpers/move-device.ts"), () => ({
  moveDeviceToPath: vi.fn(),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import {
  type DeviceMove,
  moveDeviceToPath,
} from "#src/tools/device/update/helpers/move-device.ts";

const COPY_PATH = livePath.track(0).device(2);

let track: RegisteredMockObject;

/**
 * A Reverb on track 0 at d1. Live's copy of it at d2 is there only when the
 * test says the copy was made.
 * @param copyMade - Whether the copy exists
 * @param copyName - What the copy is called
 */
function registerReverb(copyMade: boolean, copyName = "Reverb"): void {
  track = registerMockObject("track0", {
    path: livePath.track(0),
    properties: {
      devices: copyMade
        ? children("eq", "reverb", "reverb-copy")
        : children("eq", "reverb"),
    },
  });
  registerMockObject("reverb", {
    path: livePath.track(0).device(1),
    properties: { name: "Reverb", type: 2 },
  });
  registerMockObject("live_set", { path: livePath.liveSet });

  if (copyMade) {
    registerMockObject("reverb-copy", {
      path: COPY_PATH,
      properties: { name: copyName, type: 2 },
    });
  }
}

/**
 * Have the remote script answer.
 * @param result - What the node route answers
 */
function remoteScriptAnswers(result: object): void {
  vi.mocked(requestNode).mockResolvedValue({ success: true, result });
}

describe("duplicate device - a copy that can't be placed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerReverb(true);
    remoteScriptAnswers({ available: true, index: 2 });
  });

  it("deletes the copy and says why when the move is refused", async () => {
    simulateMockDeletes();
    vi.mocked(moveDeviceToPath).mockReturnValue({
      outcome: "refused",
      reason: "no room",
    });

    await expect(
      duplicate({ type: "device", id: "reverb", toPath: "t1/d0" }),
    ).rejects.toThrow(
      'the copy of t0/d1 (id reverb) could not be moved to "t1/d0": no room',
    );
    expect(track.call).toHaveBeenCalledWith("delete_device", 2);
  });

  it("deletes the copy when the move throws", async () => {
    simulateMockDeletes();
    vi.mocked(moveDeviceToPath).mockImplementation(() => {
      throw new Error("Live said no");
    });

    await expect(
      duplicate({ type: "device", id: "reverb", toPath: "t1/d0" }),
    ).rejects.toThrow("Live said no");
    expect(track.call).toHaveBeenCalledWith("delete_device", 2);
  });

  it("deletes the copy when the destination names nowhere", async () => {
    simulateMockDeletes();
    vi.mocked(moveDeviceToPath).mockReturnValue({ outcome: "no-destination" });

    await expect(
      duplicate({ type: "device", id: "reverb", toPath: "t1/d0" }),
    ).rejects.toThrow('no destination at toPath "t1/d0"');
    expect(track.call).toHaveBeenCalledWith("delete_device", 2);
  });

  it("says where the copy is left when it can't be deleted either", async () => {
    vi.mocked(moveDeviceToPath).mockReturnValue({
      outcome: "unresolvable",
      reason: "no such track",
    });

    // Without simulated deletes the copy survives the delete call.
    await expect(
      duplicate({ type: "device", id: "reverb", toPath: "t1/d0" }),
    ).rejects.toThrow(
      /not copied — no such track; the copy may be left at .*t0\/d2.*it wasn't deleted/,
    );
  });

  it("keeps the move's own wording when the copy was deleted", async () => {
    simulateMockDeletes();
    vi.mocked(moveDeviceToPath).mockReturnValue({
      outcome: "unresolvable",
      reason: "no such track",
    } satisfies DeviceMove);

    await expect(
      duplicate({ type: "device", id: "reverb", toPath: "t1/d0" }),
    ).rejects.toThrow(/^t0\/d1 \(id reverb\) not copied — no such track$/);
  });

  it("leaves a copy alone that no longer looks like the copy", async () => {
    simulateMockDeletes();
    // The move fails after something else took the copy's place.
    vi.mocked(moveDeviceToPath).mockImplementation(() => {
      registerReverb(true, "Something else");
      throw new Error("Live said no");
    });

    await expect(
      duplicate({ type: "device", id: "reverb", toPath: "t1/d0" }),
    ).rejects.toThrow(
      /Live said no; the copy may be left at .*it no longer looks like the copy/,
    );
    expect(track.call).not.toHaveBeenCalledWith(
      "delete_device",
      expect.anything(),
    );
  });
});

describe("duplicate device - a copy the remote script didn't make", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws, with nothing to clean up, when Live refused", async () => {
    registerReverb(false);
    remoteScriptAnswers({ available: true, error: "Can not duplicate it" });

    await expect(duplicate({ type: "device", id: "reverb" })).rejects.toThrow(
      "t0/d1 (id reverb) not copied — Can not duplicate it",
    );
    expect(track.call).not.toHaveBeenCalledWith(
      "delete_device",
      expect.anything(),
    );
  });

  it("names where a copy may be when the answer never came", async () => {
    registerReverb(false);
    remoteScriptAnswers({
      available: true,
      error: "Live did not answer in time",
      unfinished: true,
    });

    await expect(duplicate({ type: "device", id: "reverb" })).rejects.toThrow(
      "t0/d1 (id reverb) not copied — Live did not answer in time; Live may have copied it anyway, to t0/d2, so check before re-running",
    );
  });

  it("keeps a copy that landed though the answer never came", async () => {
    registerReverb(false);
    // The copy appears while the request is waited on.
    vi.mocked(requestNode).mockImplementation(() => {
      registerReverb(true);

      return Promise.resolve({
        success: true,
        result: { available: true, error: "no answer", unfinished: true },
      });
    });

    const result = await duplicate({ type: "device", id: "reverb" });

    expect(result).toStrictEqual({
      id: "reverb-copy",
      path: "t0/d2",
      detail:
        "the device was copied, but the remote script's answer was: no answer",
    });
  });

  it("treats no answer from Node as one that may have landed", async () => {
    registerReverb(false);
    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error: "timed out",
    });

    await expect(duplicate({ type: "device", id: "reverb" })).rejects.toThrow(
      /timed out; Live may have copied it anyway/,
    );
  });

  it("says so when the copy isn't where the remote script put it", async () => {
    mockNonExistentObjects();
    registerReverb(false);
    remoteScriptAnswers({ available: true, index: 2 });

    await expect(duplicate({ type: "device", id: "reverb" })).rejects.toThrow(
      "t0/d2 isn't a copy of it; nothing was moved or deleted",
    );
  });

  it("moves and deletes nothing when the copy is at another index", async () => {
    registerReverb(true);
    remoteScriptAnswers({ available: true, index: 3 });

    await expect(
      duplicate({ type: "device", id: "reverb", toPath: "t1/d0" }),
    ).rejects.toThrow(
      "was copied, but to t0/d3, not t0/d2; nothing was moved or deleted",
    );
    expect(moveDeviceToPath).not.toHaveBeenCalled();
    expect(track.call).not.toHaveBeenCalledWith(
      "delete_device",
      expect.anything(),
    );
  });

  it("moves and deletes nothing when another device is in the copy's slot", async () => {
    registerReverb(true, "Compressor");
    remoteScriptAnswers({ available: true, index: 2 });

    await expect(
      duplicate({ type: "device", id: "reverb", toPath: "t1/d0" }),
    ).rejects.toThrow(
      "the device at t0/d2 isn't a copy of it; nothing was moved or deleted",
    );
    expect(moveDeviceToPath).not.toHaveBeenCalled();
    expect(track.call).not.toHaveBeenCalledWith(
      "delete_device",
      expect.anything(),
    );
  });

  it("tells a device of another class from the copy", async () => {
    registerReverb(true);
    registerMockObject("reverb-copy", {
      path: COPY_PATH,
      properties: { name: "Reverb", type: 2, class_name: "Delay" },
    });
    remoteScriptAnswers({ available: true, index: 2 });

    await expect(duplicate({ type: "device", id: "reverb" })).rejects.toThrow(
      "isn't a copy of it",
    );
  });

  it("checks what appeared after an answer that never came", async () => {
    registerReverb(false);
    vi.mocked(requestNode).mockImplementation(() => {
      registerReverb(true, "Compressor");

      return Promise.resolve({
        success: true,
        result: { available: true, error: "no answer", unfinished: true },
      });
    });

    await expect(
      duplicate({ type: "device", id: "reverb", toPath: "t1/d0" }),
    ).rejects.toThrow(
      "may have been copied (no answer), but the device at t0/d2 isn't a copy of it; nothing was moved or deleted",
    );
    expect(moveDeviceToPath).not.toHaveBeenCalled();
  });
});
