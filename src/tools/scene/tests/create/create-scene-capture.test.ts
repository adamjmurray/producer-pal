// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  failCall,
  failOnSet,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { createScene } from "../../create-scene.ts";
import { setupCaptureMocks } from "./capture-scene-mocks.ts";

describe("createScene capture", () => {
  it("refuses count with capture before anything is made", () => {
    const { liveSet } = setupCaptureMocks();

    expect(() => createScene({ capture: true, count: 2 })).toThrow(
      "count can't be used with capture",
    );
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("refuses a time signature Live can't keep before capturing", () => {
    const { liveSet } = setupCaptureMocks();

    expect(() => createScene({ capture: true, timeSignature: "4/3" })).toThrow(
      'timeSignature "4/3" has a denominator Live can\'t keep',
    );
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("keeps the captured scene's entry when it would not take its name", () => {
    const { newScene } = setupCaptureMocks();

    failOnSet(newScene);

    expect(createScene({ capture: true, name: "Take" })).toStrictEqual({
      id: "live_set/scenes/2",
      path: "s2",
      detail: `${LIVE_FAILURE}; already changed: scene captured`,
    });
  });

  it("names the empty scenes added for a capture Live then refused", () => {
    registerMockObject("live_set/view", { path: livePath.view.song });
    registerMockObject("live_set/scenes/3", { path: livePath.scene(3) });

    const { liveSet } = setupCaptureMocks(3, [], 2);

    failCall(liveSet, /^capture_and_insert_scene$/, 1);

    expect(() => createScene({ capture: true, path: "s4" })).toThrow(
      `${LIVE_FAILURE}; created s2-s3 to reach it`,
    );
  });

  it("throws when Live ignores the capture, though a scene stands at its index", () => {
    const { liveSet } = setupCaptureMocks();

    liveSet.methods.capture_and_insert_scene = () => null;

    expect(() => createScene({ capture: true })).toThrow(
      "Live did not capture a scene",
    );
  });
});
