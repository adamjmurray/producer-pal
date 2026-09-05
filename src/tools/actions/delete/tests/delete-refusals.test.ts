// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { setupSceneMocks, setupTrackMocks } from "./delete-test-helpers.ts";
import { deleteObject } from "../delete.ts";

interface RefusalCase {
  /** Test name, and what the object is called */
  name: string;
  /** Tool-level type to delete as */
  type: string;
  /** ID of the object that survives */
  id: string;
  /** The path the warning names it by */
  path: string;
  /** Registers the target plus a parent whose delete method does nothing */
  setup: () => void;
}

const REFUSALS: RefusalCase[] = [
  {
    name: "track",
    type: "track",
    id: "track_1",
    path: "t1",
    setup: () => {
      setupTrackMocks({ track_1: String(livePath.track(1)) });
      registerMockObject("live_set", {
        path: livePath.liveSet,
        methods: { delete_track: () => null },
      });
    },
  },
  {
    name: "return track",
    type: "track",
    id: "return_0",
    path: "rt0",
    setup: () => {
      setupTrackMocks({ return_0: "live_set return_tracks 0" });
      registerMockObject("live_set", {
        path: livePath.liveSet,
        methods: { delete_return_track: () => null },
      });
    },
  },
  {
    name: "scene",
    type: "scene",
    id: "scene_0",
    path: "s0",
    setup: () => {
      setupSceneMocks({ scene_0: livePath.scene(0) });
      registerMockObject("live_set", {
        path: livePath.liveSet,
        methods: { delete_scene: () => null },
      });
    },
  },
  {
    name: "clip",
    type: "clip",
    id: "clip_0",
    path: "t0/s0",
    setup: () => {
      registerMockObject("clip_0", {
        path: livePath.track(0).clipSlot(0).clip(),
        type: "Clip",
      });
      registerMockObject("track_0", {
        path: livePath.track(0),
        methods: { delete_clip: () => null },
      });
    },
  },
  {
    name: "device",
    type: "device",
    id: "device_0",
    path: "t0/d0",
    setup: () => {
      registerMockObject("device_0", {
        path: livePath.track(0).device(0),
        type: "Device",
      });
      registerMockObject("track_0", {
        path: livePath.track(0),
        methods: { delete_device: () => null },
      });
    },
  },
];

// Live refuses some deletes without saying so. Two seen on 12.4.3: the last
// remaining scene, and the only child of a group track. Each case here lets the
// delete run and has Live ignore it, so what's under test is the check
// afterward, not the call.
describe("deleteObject when Live refuses the delete", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    simulateMockDeletes();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it.each(REFUSALS)("reports a $name that survives the delete", (refusal) => {
    const { type, id, path, setup } = refusal;

    setup();

    expect(deleteObject({ id: id, type })).toStrictEqual({
      id,
      path,
      type,
      deleted: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      `${type} ${path} (id ${id}) still exists, so Live did not delete it`,
    );
  });

  it("reports deleted true once Live does remove the object", () => {
    setupTrackMocks({ track_1: String(livePath.track(1)) });
    registerMockObject("live_set", { path: livePath.liveSet });

    expect(deleteObject({ id: "track_1", type: "track" })).toStrictEqual({
      id: "track_1",
      deletedPath: "t1",
      type: "track",
      deleted: true,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
