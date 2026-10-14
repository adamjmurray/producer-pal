// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { repeatForCount } from "#src/tools/shared/validation/lists/insertion-plan.ts";
import { createScene } from "../../create-scene.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

const HUGE = 1_000_000_000;

const refusal = (count: number, index: number): string =>
  `creating ${count} scenes at index ${index} would exceed the maximum allowed scenes (${MAX_AUTO_CREATED_SCENES})`;

describe("createScene count cap", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { scenes: children("existing1", "existing2") },
    });
    registerMockObject("app-view", { path: livePath.view.app });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a huge count at an index without building it", () => {
    const from = vi.spyOn(Array, "from");

    expect(() => createScene({ sceneIndex: 1, count: HUGE })).toThrow(
      refusal(HUGE, 1),
    );
    expect(from).not.toHaveBeenCalledWith({ length: HUGE }, expect.anything());
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("names the end of the Set when a huge count appends", () => {
    const from = vi.spyOn(Array, "from");

    expect(() => createScene({ path: "s+", count: HUGE })).toThrow(
      refusal(HUGE, 2),
    );
    expect(from).not.toHaveBeenCalledWith({ length: HUGE }, expect.anything());
  });

  it("refuses one past the cap", () => {
    const count = MAX_AUTO_CREATED_SCENES + 1;

    expect(() => createScene({ sceneIndex: 0, count })).toThrow(
      refusal(count, 0),
    );
  });

  // Planned below the tool: creating 1000 mocked scenes outlasts a test's
  // timeout on CI.
  it("still plans exactly the cap", () => {
    const refuse = vi.fn<(count: number, target: string) => never>();

    expect(
      repeatForCount(["s0"], MAX_AUTO_CREATED_SCENES, {
        max: MAX_AUTO_CREATED_SCENES,
        refuse,
      }),
    ).toHaveLength(MAX_AUTO_CREATED_SCENES);
    expect(refuse).not.toHaveBeenCalled();
  });
});
