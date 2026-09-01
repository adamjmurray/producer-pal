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
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateTrack by path", () => {
  let track0: RegisteredMockObject;
  let track1: RegisteredMockObject;
  let returnTrack: RegisteredMockObject;
  let mainTrack: RegisteredMockObject;

  beforeEach(() => {
    clearCapturedWarnings();
    track0 = registerMockObject("123", { path: livePath.track(0) });
    track1 = registerMockObject("456", { path: livePath.track(1) });
    returnTrack = registerMockObject("r1", { path: livePath.returnTrack(1) });
    mainTrack = registerMockObject("m", { path: livePath.masterTrack() });
  });

  it("updates the track a path names", () => {
    const result = updateTrack({ path: "t0", name: "By Path" });

    expect(track0.set).toHaveBeenCalledWith("name", "By Path");
    expect(result).toStrictEqual({ id: "123", path: "t0" });
  });

  it("reaches a return track and the main track", () => {
    const result = updateTrack({ path: "rt1,mt", color: "#FF0000" });

    expect(returnTrack.set).toHaveBeenCalledWith("color", 16711680);
    expect(mainTrack.set).toHaveBeenCalledWith("color", 16711680);
    expect(result).toStrictEqual([
      { id: "r1", path: "rt1" },
      { id: "m", path: "mt" },
    ]);
  });

  it("adds paths to the ids rather than pairing with them", () => {
    const result = updateTrack({
      id: "123",
      path: "t1",
      name: "First,Second",
    });

    expect(track0.set).toHaveBeenCalledWith("name", "First");
    expect(track1.set).toHaveBeenCalledWith("name", "Second");
    expect(result).toStrictEqual([
      { id: "123", path: "t0" },
      { id: "456", path: "t1" },
    ]);
  });

  it("says a path names the wrong kind of object, and keeps its place", () => {
    const result = updateTrack({ path: "s0,t1", name: "First,Second" });

    // The skipped entry keeps its slot: "Second" must not slide onto t1's
    // neighbor, and t1 must not be renamed "First".
    expect(track1.set).toHaveBeenCalledWith("name", "Second");
    expect(result).toStrictEqual({ id: "456", path: "t1" });
    expect(capturedWarnings()).toContain(
      'updateTrack: invalid path "s0" - names a scene, not a track; expected "t<index>", "rt<index>", or "mt"',
    );
  });

  it("says when a path names a track that isn't there", () => {
    mockNonExistentObjects();

    expect(updateTrack({ path: "t9", name: "Nowhere" })).toStrictEqual([]);
    expect(capturedWarnings()).toContain('updateTrack: nothing at path "t9"');
  });

  it("still asks for a target when neither id nor path is given", () => {
    expect(updateTrack({ name: "Orphan" })).toStrictEqual([]);
    expect(capturedWarnings()).toContain("updateTrack: id or path is required");
  });

  it("counts ids and paths together when checking list lengths", () => {
    expect(() =>
      updateTrack({ id: "123", path: "t1", name: "One,Two,Three" }),
    ).toThrow("id and path names 2 entries but name names 3 entries.");
  });
});
