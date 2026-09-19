// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { sceneIdAtPath, trackIdAtPath } from "../path-target-lookup.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("trackIdAtPath", () => {
  beforeEach(() => {
    registerMockObject("t0", { path: livePath.track(0) });
  });

  it.each([
    ["t0", livePath.track(0)],
    ["rt0", livePath.returnTrack(0)],
    ["mt", livePath.masterTrack()],
  ])("names the track at %s", (path, livePathForTrack) => {
    registerMockObject(path, { path: livePathForTrack });

    expect(trackIdAtPath(path)).toStrictEqual({ id: path });
  });

  // An addressable place with no track in it: the caller decides what that
  // costs, so it is reported rather than raised.
  it("reports an empty place, with the noun it was looking for", () => {
    mockNonExistentObjects();

    expect(trackIdAtPath("t9")).toStrictEqual({
      id: null,
      reason: 'no track at path "t9"',
      empty: true,
    });
  });

  it("names the param the path came from", () => {
    mockNonExistentObjects();

    expect(trackIdAtPath("t9", "toPath")).toStrictEqual({
      id: null,
      reason: 'no track at toPath "t9"',
      empty: true,
    });
  });

  // Every kind a path can name gets its own noun, so the model is told what it
  // actually wrote rather than just that the path was wrong.
  it.each([
    ["s1", "a scene"],
    ["t0/s1", "a clip slot"],
    ["t0/l0", "a take lane"],
    ["t0/d1", "a device"],
    ["t0[5|1]", "an arrangement clip"],
    // A "+" root would otherwise be described by the default arm as "a track",
    // making the message read "names a track, not a track".
    ["s+", "a new scene"],
  ])("throws that %s names %s, not a track", (path, noun) => {
    expect(() => trackIdAtPath(path)).toThrow(
      `invalid path "${path}" - names ${noun}, not a track; expected "t<index>", "rt<index>", or "mt"`,
    );
  });
});

describe("sceneIdAtPath", () => {
  beforeEach(() => {
    registerMockObject("s0", { path: livePath.scene(0) });
  });

  it("names the scene a path holds", () => {
    expect(sceneIdAtPath("s0")).toStrictEqual({ id: "s0" });
  });

  it("reports an empty place", () => {
    mockNonExistentObjects();

    expect(sceneIdAtPath("s9")).toStrictEqual({
      id: null,
      reason: 'no scene at path "s9"',
      empty: true,
    });
  });

  it.each([
    ["t1", "a track"],
    ["rt1", "a track"],
    ["mt", "a track"],
    ["t0/s1", "a clip slot"],
  ])("throws that %s names %s, not a scene", (path, noun) => {
    expect(() => sceneIdAtPath(path)).toThrow(
      `invalid path "${path}" - names ${noun}, not a scene; expected "s<index>"`,
    );
  });
});
