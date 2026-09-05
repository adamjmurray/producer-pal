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
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { sceneIdPerPath, trackIdPerPath } from "../path-target-lookup.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("trackIdPerPath", () => {
  beforeEach(() => {
    clearCapturedWarnings();
    registerMockObject("t0", { path: livePath.track(0) });
  });

  it("names the track at each path, in order", () => {
    registerMockObject("rt0", { path: livePath.returnTrack(0) });
    registerMockObject("mt", { path: livePath.masterTrack() });

    expect(trackIdPerPath("t0, rt0, mt")).toStrictEqual(["t0", "rt0", "mt"]);
  });

  // Every kind a path can name gets its own noun, so the model is told what it
  // actually wrote rather than just that the path was wrong.
  it.each([
    ["s1", "a scene"],
    ["t0/s1", "a clip slot"],
    ["t0/l0", "a take lane"],
    ["t0/l+", "a take lane"],
    ["t0/d1", "a device"],
    ["t0[5|1]", "an arrangement clip"],
  ])("says %s names %s, not a track", (path, noun) => {
    expect(trackIdPerPath(path)).toStrictEqual([null]);
    expect(capturedWarnings()).toContain(
      `invalid path "${path}" - names ${noun}, not a track; expected "t<index>", "rt<index>", or "mt"`,
    );
  });

  it("keeps a bad entry's place so the good ones stay put", () => {
    expect(trackIdPerPath("s1,t0")).toStrictEqual([null, "t0"]);
  });

  it("refuses a hole in the list", () => {
    // Nothing can line up against a list whose length is a guess, so this is
    // refused before anything runs — the same as a hole in `id`.
    expect(() => trackIdPerPath("t0,,t1")).toThrow(/empty entry/);
  });

  it("ignores one trailing comma", () => {
    expect(trackIdPerPath("t0,")).toStrictEqual(["t0"]);
  });
  // A "+" root would otherwise be described by the default arm as "a track",
  // making the message read "names a track, not a track".
  it("says a path names something to create, not a track", () => {
    expect(trackIdPerPath("s+")).toStrictEqual([null]);
    expect(capturedWarnings()).toContain(
      'invalid path "s+" - names a new scene, not a track; expected "t<index>", "rt<index>", or "mt"',
    );
  });
});

describe("sceneIdPerPath", () => {
  beforeEach(() => {
    clearCapturedWarnings();
    registerMockObject("s0", { path: livePath.scene(0) });
  });

  it("names the scene at each path, in order", () => {
    registerMockObject("s2", { path: livePath.scene(2) });

    expect(sceneIdPerPath("s0,s2")).toStrictEqual(["s0", "s2"]);
  });

  it.each([
    ["t1", "a track"],
    ["rt1", "a track"],
    ["mt", "a track"],
    ["t0/s1", "a clip slot"],
  ])("says %s names %s, not a scene", (path, noun) => {
    expect(sceneIdPerPath(path)).toStrictEqual([null]);
    expect(capturedWarnings()).toContain(
      `invalid path "${path}" - names ${noun}, not a scene; expected "s<index>"`,
    );
  });
});
