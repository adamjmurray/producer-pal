// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateScene } from "../update-scene.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateScene by path", () => {
  let scene0: RegisteredMockObject;
  let scene1: RegisteredMockObject;

  beforeEach(() => {
    clearCapturedWarnings();
    scene0 = registerMockObject("123", { path: livePath.scene(0) });
    scene1 = registerMockObject("456", { path: livePath.scene(1) });
  });

  it("updates the scene a path names", () => {
    const result = updateScene({ path: "s0", name: "By Path" });

    expect(scene0.set).toHaveBeenCalledWith("name", "By Path");
    expect(result).toStrictEqual({ id: "123", path: "s0" });
  });

  it("adds paths to the ids rather than pairing with them", () => {
    const result = updateScene({
      id: "123",
      path: "s1",
      name: "First,Second",
    });

    expect(scene0.set).toHaveBeenCalledWith("name", "First");
    expect(scene1.set).toHaveBeenCalledWith("name", "Second");
    expect(result).toStrictEqual([
      { id: "123", path: "s0" },
      { id: "456", path: "s1" },
    ]);
  });

  it("says a path names the wrong kind of object, and keeps its place", () => {
    const result = updateScene({ path: "t0,s1", name: "First,Second" });

    // The skipped entry keeps its slot, so "Second" lands on s1 rather than
    // sliding forward onto it.
    expect(scene1.set).toHaveBeenCalledWith("name", "Second");
    expect(result).toStrictEqual({ id: "456", path: "s1" });
    expect(capturedWarnings()).toContain(
      'invalid path "t0" - names a track, not a scene; expected "s<index>"',
    );
  });

  it("says when a path names a scene that isn't there", () => {
    mockNonExistentObjects();

    expect(updateScene({ path: "s9", name: "Nowhere" })).toStrictEqual([]);
    expect(capturedWarnings()).toContain('nothing at path "s9"');
  });

  it("still asks for a target when neither id nor path is given", () => {
    expect(() => updateScene({ name: "Orphan" })).toThrow(
      "id or path is required",
    );
  });

  it("refuses a hole in the path list", () => {
    // Before, this warned and dropped every target while the length check
    // still counted the hole - so a paired name list passed and landed on
    // nothing at all.
    expect(() =>
      updateScene({ path: "s0,,s1", name: "One,Two,Three" }),
    ).toThrow(/empty entry/);
  });

  it("counts ids and paths together when checking list lengths", () => {
    expect(() =>
      updateScene({ id: "123", path: "s1", name: "One,Two,Three" }),
    ).toThrow("id and path names 2 entries but name names 3 entries.");
  });
});
