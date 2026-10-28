// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupSelectMock } from "#src/test/focus-test-helpers.ts";
import { updateScene } from "../../update-scene.ts";
import { registerThreeScenes } from "../scene-fixtures.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

const NOTHING_TO_UPDATE =
  "nothing to update: id and path only name the scenes; also send a param to change";

describe("updateScene - a call that asks nothing of its scenes", () => {
  const selectMockRef = setupSelectMock();

  beforeEach(() => {
    registerThreeScenes();
  });

  it.each([
    { id: "123" },
    { path: "s0,s1" },
    { id: "123", tempo: null },
    { id: "123", focus: false },
  ])("refuses %j before anything is written", (args) => {
    expect(() => updateScene(args)).toThrow(NOTHING_TO_UPDATE);
  });

  it("counts focus as something asked", () => {
    updateScene({ id: "123", focus: true });

    expect(selectMockRef.get()).toHaveBeenCalledWith({
      view: "session",
      id: "123",
    });
  });
});

describe("updateScene - a path that can't be parsed", () => {
  it("refuses the whole call, writing nothing", () => {
    const [scene1, scene2] = registerThreeScenes();

    expect(() =>
      updateScene({ path: "s0,not-a-path,s1", name: "A,B,C" }),
    ).toThrow('invalid path "not-a-path"');
    expect(scene1.set).not.toHaveBeenCalled();
    expect(scene2.set).not.toHaveBeenCalled();
  });
});
