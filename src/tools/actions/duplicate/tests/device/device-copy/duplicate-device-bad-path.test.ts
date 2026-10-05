// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerMockObject,
  registerPendingMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { remoteScriptDown } from "#src/tools/actions/duplicate/helpers/device/remote-script-down-test-helpers.ts";
import {
  mockNonExistentObjects,
  simulateMockDeletes,
  simulateMockMoves,
} from "#src/test/mocks/mock-registry.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

// The real move runs here — the rest of the device suite stubs it out, which is
// how a destination that threw before returning an outcome went unnoticed.
describe("duplicate device - a toPath entry that names nowhere", () => {
  beforeEach(remoteScriptDown);

  it("keeps the copy that landed when a later destination doesn't resolve", async () => {
    mockNonExistentObjects();
    simulateMockDeletes();
    // Live moves the copy into the destination, and the delete after it
    // closes the tracks up again.
    simulateMockMoves();

    registerMockObject("device1", {
      path: livePath.track(0).device(0),
      type: "PluginDevice",
    });
    // The temp copy of the source track parks at index 1 and shifts the
    // destination to t3 for the move; Live deletes it again afterwards.
    registerPendingMockObject("live_set/tracks/1/devices/0", {
      path: livePath.track(1).device(0),
      type: "PluginDevice",
    });
    registerMockObject("track-2", { path: livePath.track(2), type: "Track" });
    registerMockObject("live_set", { path: livePath.liveSet });

    const result = await duplicate({
      type: "device",
      id: "device1",
      toPath: "t2/d0,t99/d0/c0",
    });

    // The good destination still reports its copy, and the bad one keeps its
    // slot, naming the path the caller sent rather than the shifted t100.
    expect(result).toStrictEqual([
      { id: "live_set/tracks/1/devices/0", path: "t2/d0" },
      {
        path: "t99/d0/c0",
        ok: false,
        detail:
          't0/d0 (id device1) not copied — Track in path "t99/d0/c0" does not exist',
      },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });
});

// A type segment that names no device names no source either. Every source has
// to be known before anything is copied, so the call is refused — and the miss
// that refused it says what the track does hold.
describe("duplicate device - a source path that names nothing by type", () => {
  it("throws, saying what the track holds", async () => {
    mockNonExistentObjects();

    registerMockObject("track-0", {
      path: livePath.track(0),
      properties: { devices: ["id", "device1"] },
    });
    registerMockObject("device1", {
      path: livePath.track(0).device(0),
      type: "PluginDevice",
      properties: { type: 2 },
    });

    await expect(
      duplicate({ type: "device", path: "t0/inst" }),
    ).rejects.toThrow('nothing at path "t0/inst": t0 has no instrument');
    expect(capturedWarnings()).toStrictEqual([]);
  });
});
