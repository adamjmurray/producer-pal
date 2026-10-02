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
import { updateScene } from "../update-scene.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

/** The numerator/denominator pairs a scene mock was asked to set. */
function meterWrites(scene: RegisteredMockObject): unknown[][] {
  return scene.set.mock.calls.filter(([property]: unknown[]) =>
    String(property).startsWith("time_signature_"),
  );
}

describe("createScene timeSignature pairing", () => {
  let scenes: RegisteredMockObject[];

  beforeEach(() => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { scenes: children("existing1", "existing2") },
    });

    scenes = Array.from({ length: 4 }, (_unused, i) =>
      registerMockObject(`live_set/scenes/${i}`, { path: livePath.scene(i) }),
    );
  });

  it("pairs one time signature per scene, in order", () => {
    createScene({ path: "s+,s+", timeSignature: "3/4,7/8" });

    expect(meterWrites(scenes[2] as RegisteredMockObject)).toStrictEqual([
      ["time_signature_numerator", 3],
      ["time_signature_denominator", 4],
      ["time_signature_enabled", true],
    ]);
    expect(meterWrites(scenes[3] as RegisteredMockObject)).toStrictEqual([
      ["time_signature_numerator", 7],
      ["time_signature_denominator", 8],
      ["time_signature_enabled", true],
    ]);
  });

  it("broadcasts a single value to every scene", () => {
    createScene({ path: "s+,s+", timeSignature: "5/4" });

    for (const index of [2, 3]) {
      expect(meterWrites(scenes[index] as RegisteredMockObject)).toStrictEqual([
        ["time_signature_numerator", 5],
        ["time_signature_denominator", 4],
        ["time_signature_enabled", true],
      ]);
    }
  });

  it("refuses a list that names a different number of scenes", () => {
    expect(() =>
      createScene({ path: "s+,s+", timeSignature: "3/4,7/8,5/4" }),
    ).toThrow("path names 2 scenes but timeSignature names 3 entries");
  });

  it("refuses a malformed entry before any scene is made", () => {
    expect(() =>
      createScene({ path: "s+,s+", timeSignature: "3/4,nope" }),
    ).toThrow("Time signature must be in format");
    expect(scenes[2]?.set).not.toHaveBeenCalled();
  });

  it.each(["4-4", "4/0"])(
    "refuses a malformed %s before capturing anything",
    (timeSignature) => {
      const liveSet = registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: [] },
      });
      const appView = registerMockObject("live_set/view", {
        path: livePath.view.song,
      });

      registerMockObject("live_set/view/selected_scene", {
        path: livePath.scene(1),
      });

      expect(() => createScene({ capture: true, timeSignature })).toThrow(
        /Time signature/,
      );
      expect(liveSet.call).not.toHaveBeenCalled();
      expect(appView.set).not.toHaveBeenCalled();
      expect(scenes[2]?.set).not.toHaveBeenCalled();
    },
  );
});

describe("updateScene timeSignature pairing", () => {
  let scene1: RegisteredMockObject;
  let scene2: RegisteredMockObject;
  let scene3: RegisteredMockObject;

  beforeEach(() => {
    scene1 = registerMockObject("123", { path: livePath.scene(0) });
    scene2 = registerMockObject("456", { path: livePath.scene(1) });
    scene3 = registerMockObject("789", { path: livePath.scene(2) });
  });

  it("pairs one time signature per scene, in order", () => {
    updateScene({ id: "123,456", timeSignature: "3/4,7/8" });

    expect(meterWrites(scene1)).toStrictEqual([
      ["time_signature_numerator", 3],
      ["time_signature_denominator", 4],
      ["time_signature_enabled", true],
    ]);
    expect(meterWrites(scene2)).toStrictEqual([
      ["time_signature_numerator", 7],
      ["time_signature_denominator", 8],
      ["time_signature_enabled", true],
    ]);
  });

  it('pairs "disabled" as one entry among the rest', () => {
    updateScene({ id: "123,456", timeSignature: "disabled,6/8" });

    expect(meterWrites(scene1)).toStrictEqual([
      ["time_signature_enabled", false],
    ]);
    expect(meterWrites(scene2)).toStrictEqual([
      ["time_signature_numerator", 6],
      ["time_signature_denominator", 8],
      ["time_signature_enabled", true],
    ]);
  });

  it("broadcasts a single value to every scene", () => {
    updateScene({ id: "123,456,789", timeSignature: "5/4" });

    for (const scene of [scene1, scene2, scene3]) {
      expect(meterWrites(scene)).toStrictEqual([
        ["time_signature_numerator", 5],
        ["time_signature_denominator", 4],
        ["time_signature_enabled", true],
      ]);
    }
  });

  it("refuses a list that names a different number of scenes", () => {
    expect(() =>
      updateScene({ id: "123,456", timeSignature: "3/4,7/8,5/4" }),
    ).toThrow("id names 2 entries but timeSignature names 3 entries");
  });

  it("refuses a malformed entry before any scene is touched", () => {
    expect(() =>
      updateScene({ id: "123,456", timeSignature: "3/4,nope" }),
    ).toThrow("Time signature must be in format");
    expect(scene1.set).not.toHaveBeenCalled();
  });

  // With one target a comma is part of the value, not a separator — which is
  // how the whole value reaches the parser and is refused as one meter.
  it("reads the whole value literally for one scene", () => {
    expect(() => updateScene({ id: "123", timeSignature: "3/4,7/8" })).toThrow(
      "Time signature must be in format",
    );
  });
});
