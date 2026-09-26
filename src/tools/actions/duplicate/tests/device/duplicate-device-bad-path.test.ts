// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { registerMockObject } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

// The real move runs here — the rest of the device suite stubs it out, which is
// how a destination that threw before returning an outcome went unnoticed.
describe("duplicate device - a toPath entry that names nowhere", () => {
  it("keeps the copy that landed when a later destination doesn't resolve", async () => {
    mockNonExistentObjects();

    registerMockObject("device1", {
      path: livePath.track(0).device(0),
      type: "PluginDevice",
    });
    registerMockObject("live_set/tracks/1/devices/0", {
      path: livePath.track(1).device(0),
      type: "PluginDevice",
    });
    // t2 is t3 by the time the move runs: duplicate_track parks a temp copy of
    // the source track at index 1 and shifts everything after it.
    registerMockObject("track-3", { path: livePath.track(3), type: "Track" });
    // The registry answers statically, so the destination has to be told it
    // holds the device now — otherwise the move reads back as refused.
    registerMockObject("live_set", {
      path: livePath.liveSet,
      methods: {
        move_device: (device, container) => {
          const target = lookupMockObject(
            String(container).slice("id ".length),
          );

          if (target != null) {
            target.properties.devices = [
              "id",
              String(device).slice("id ".length),
            ];
          }

          return null;
        },
      },
    });

    const result = await duplicate({
      type: "device",
      id: "device1",
      toPath: "t2/d0,t99/d0/c0",
    });

    // The good destination still reports its copy, and the bad one keeps its
    // slot, naming the path the caller sent rather than the shifted t100.
    expect(result).toStrictEqual([
      { id: "live_set/tracks/1/devices/0", path: "t1/d0" },
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
  it("refuses the call, saying what the track holds", async () => {
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
    ).rejects.toThrow('nothing to duplicate at path "t0/inst"');
    expect(capturedWarnings()).toStrictEqual([
      'nothing at path "t0/inst": t0 has no instrument',
    ]);
  });
});
