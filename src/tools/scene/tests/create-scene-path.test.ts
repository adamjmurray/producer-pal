// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createScene } from "../create-scene.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

describe("createScene by path", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { scenes: children("existing1", "existing2") },
    });

    for (let i = 0; i <= 3; i++) {
      registerMockObject(`live_set/scenes/${i}`, { path: livePath.scene(i) });
    }
  });

  it("inserts at the index a path names", () => {
    expect(createScene({ path: "s1", name: "Inserted" })).toStrictEqual({
      id: "live_set/scenes/1",
      path: "s1",
    });
    expect(liveSet.call).toHaveBeenCalledWith("create_scene", 1);
  });

  // The Set has two scenes, so "s+" lands at index 2 — the append create-scene
  // had no way to ask for before.
  it("appends with s+", () => {
    expect(createScene({ path: "s+", name: "Appended" })).toStrictEqual({
      id: "live_set/scenes/2",
      path: "s2",
    });
    expect(liveSet.call).toHaveBeenCalledWith("create_scene", 2);
  });

  it("refuses a path that names no place for a scene", () => {
    expect(() => createScene({ path: "t0" })).toThrow(
      'invalid path "t0" - it names no place for a scene; expected "s+" or "s<index>"',
    );
  });

  it("refuses a path sent with sceneIndex", () => {
    expect(() => createScene({ path: "s1", sceneIndex: 0 })).toThrow(
      "path says where the scene goes - don't send sceneIndex with it",
    );
  });
});
