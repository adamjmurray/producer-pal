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

    // The good destination still reports its copy...
    expect(result).toStrictEqual([
      { id: "live_set/tracks/1/devices/0", path: "t1/d0" },
    ]);
    // ...and the bad one names the path the caller sent, not the shifted t100.
    expect(capturedWarnings()).toContain(
      'device not moved: Track in path "t99/d0/c0" does not exist',
    );
  });
});
