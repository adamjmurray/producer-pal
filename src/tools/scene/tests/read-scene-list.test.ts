// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readScene } from "../read-scene.ts";

/**
 * Register a Live Set with no tracks and two scenes.
 */
function setupScenes(): void {
  registerMockObject("live_set", {
    path: livePath.liveSet,
    type: "Song",
    properties: { tracks: [] },
  });

  for (const [index, id] of ["123", "456"].entries()) {
    registerMockObject(id, {
      path: livePath.scene(index),
      type: "Scene",
      properties: { name: `Scene ${index}` },
    });
  }
}

const scene0 = { id: "123", path: "s0", name: "Scene 0", clipCount: 0 };
const scene1 = { id: "456", path: "s1", name: "Scene 1", clipCount: 0 };

describe("readScene over a list of targets", () => {
  beforeEach(() => {
    setupScenes();
    mockNonExistentObjects();
  });

  it("reads one scene per id, in the order named", () => {
    expect(readScene({ id: "456, 123" })).toStrictEqual([scene1, scene0]);
  });

  it("reads one scene per path, in the order named", () => {
    expect(readScene({ path: "s1,s0" })).toStrictEqual([scene1, scene0]);
  });

  it("reads ids and paths together, ids first", () => {
    expect(readScene({ id: "456", path: "s0" })).toStrictEqual([
      scene1,
      scene0,
    ]);
  });

  it("takes the list from the ids and paths aliases", () => {
    expect(readScene({ ids: "123", paths: "s1" })).toStrictEqual([
      scene0,
      scene1,
    ]);
  });

  it("keeps a slot for a target it can't read, and says why", () => {
    expect(readScene({ path: "s0,s9" })).toStrictEqual([
      scene0,
      { path: "s9", ok: false, reason: 'nothing at path "s9"' },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("reports a miss by id the way the caller wrote it", () => {
    expect(readScene({ id: "123,789" })).toStrictEqual([
      scene0,
      { id: "789", ok: false, reason: 'id "789" does not exist' },
    ]);
  });

  it("unwraps a single target", () => {
    expect(readScene({ path: "s0" })).toStrictEqual(scene0);
  });

  it("still throws when the only target names nothing", () => {
    expect(() => readScene({ path: "s9" })).toThrow('nothing at path "s9"');
  });

  it("refuses a list with an empty entry", () => {
    expect(() => readScene({ path: "s0,,s1" })).toThrow(
      'invalid path "s0,,s1" - it has an empty entry',
    );
    expect(() => readScene({ id: "123,,456" })).toThrow(
      'invalid id "123,,456" - it has an empty entry',
    );
  });

  // sceneIndex names one scene on its own, so beside a list every entry would
  // read that scene, or be refused for naming two places at once.
  it("still reads the scene sceneIndex names", () => {
    expect(readScene({ sceneIndex: 1 })).toStrictEqual(scene1);
  });

  it("refuses sceneIndex beside a list", () => {
    expect(() => readScene({ path: "s0,s1", sceneIndex: 0 })).toThrow(
      "sceneIndex names one scene, but id and path name 2. " +
        "Name every scene with id or path, or drop sceneIndex.",
    );
  });

  it("warns when one side arrived blank and the other named the scenes", () => {
    expect(readScene({ id: "  ", path: "s0,s1" })).toStrictEqual([
      scene0,
      scene1,
    ]);
    expect(capturedWarnings()).toContainEqual(
      'blank id ignored — "path" names the scenes',
    );
  });
});
