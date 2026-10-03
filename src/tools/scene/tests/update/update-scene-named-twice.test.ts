// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  failOnSet,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { updateScene } from "../../update-scene.ts";
import { registerThreeScenes } from "../scene-fixtures.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

// One scene named twice, in any spelling, is written as its last mention asks.
describe("updateScene - a scene named twice", () => {
  let scene1: RegisteredMockObject;

  beforeEach(() => {
    [scene1] = registerThreeScenes();
  });

  it("writes only the last mention, whatever the earlier one was spelled as", () => {
    expect(
      updateScene({ id: "123", path: "s0", name: "First,Second" }),
    ).toStrictEqual([
      { id: "123", detail: 'named again as "s0" later in this call' },
      { id: "123", path: "s0" },
    ]);
    expect(scene1.set).toHaveBeenCalledTimes(1);
    expect(scene1.set).toHaveBeenCalledWith("name", "Second");
  });

  it("names a repeated id the same way", () => {
    expect(updateScene({ id: "123,123", name: "A,B" })).toStrictEqual([
      { id: "123", detail: "named again as id 123 later in this call" },
      { id: "123", path: "s0" },
    ]);
    expect(scene1.set).toHaveBeenCalledExactlyOnceWith("name", "B");
  });

  it("fails the earlier mention too when the last one lands nothing", () => {
    failOnSet(scene1);

    expect(updateScene({ id: "123", path: "s0", name: "A,B" })).toStrictEqual([
      {
        id: "123",
        ok: false,
        detail: 'not written: "s0" was meant to replace it, but failed',
      },
      { path: "s0", ok: false, detail: LIVE_FAILURE },
    ]);
  });
});
