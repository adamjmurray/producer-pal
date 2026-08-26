// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { liveApi } from "#src/tools/advanced/live-api.ts";

// The per-operation `path` exists so one call can mutate through one object
// while still holding another. Only the routing is testable here: the mock's
// LiveAPI.from builds a fresh instance every time, with no memo and no pool, so
// it cannot show whether clearing the memo really separates two handles onto a
// STABLE_TARGET — or whether a held object goes stale at all. That is the whole
// reason the probe has to run against real Live. See dev/LiveAPI-Object-Reuse.md.
describe("liveApi per-operation path", () => {
  let defaultMock: RegisteredMockObject;
  let trackMock: RegisteredMockObject;
  const trackPath = String(livePath.track(0));
  const originalFlag = process.env.ENABLE_OBJECT_PROBE;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    process.env.ENABLE_OBJECT_PROBE = "true";

    defaultMock = registerMockObject("1", {
      path: livePath.liveSet,
      type: "Song",
    });
    trackMock = registerMockObject("7", {
      path: livePath.track(0),
      type: "Track",
    });
  });

  afterEach(() => {
    process.env.ENABLE_OBJECT_PROBE = originalFlag;
  });

  it("routes an operation with a path to its own object", () => {
    liveApi({
      operations: [
        { path: trackPath, type: "set", property: "name", value: "probe" },
      ],
    });

    expect(trackMock.set).toHaveBeenCalledWith("name", "probe");
    expect(defaultMock.set).not.toHaveBeenCalled();
  });

  // The point of rejecting cursor semantics: a path-less operation means the
  // default object wherever it sits in the list, so an operation's target is
  // readable from the operation alone.
  it("leaves the default object where it is, before and after", () => {
    liveApi({
      operations: [
        { type: "set", property: "tempo", value: 120 },
        { path: trackPath, type: "set", property: "name", value: "probe" },
        { type: "set", property: "tempo", value: 130 },
      ],
    });

    expect(defaultMock.set.mock.calls).toStrictEqual([
      ["tempo", 120],
      ["tempo", 130],
    ]);
    expect(trackMock.set.mock.calls).toStrictEqual([["name", "probe"]]);
  });

  it("keeps the top-level path reporting the default object", () => {
    const result = liveApi({
      path: livePath.liveSet,
      operations: [
        { path: trackPath, type: "set", property: "name", value: "probe" },
      ],
    });

    expect(result.path).toBe(livePath.liveSet);
    expect(result.id).toBe("1");
  });

  it("ignores the path without the probe flag, so a release build cannot use it", () => {
    process.env.ENABLE_OBJECT_PROBE = undefined;

    liveApi({
      operations: [
        { path: trackPath, type: "set", property: "name", value: "probe" },
      ],
    });

    expect(defaultMock.set).toHaveBeenCalledWith("name", "probe");
    expect(trackMock.set).not.toHaveBeenCalled();
  });
});
