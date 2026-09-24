// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type z } from "zod";
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
// reason the probe has to run against real Live. See dev/live-api/Object-Reuse.md.
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
    // Assigning undefined to a process.env property stores the STRING
    // "undefined", which leaves the flag set for every later test in this
    // worker. Deleting is the only way to unset it.
    if (originalFlag == null) {
      delete process.env.ENABLE_OBJECT_PROBE;
    } else {
      process.env.ENABLE_OBJECT_PROBE = originalFlag;
    }
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
    // A release build has the define substitute a real undefined here, so the
    // flag has to be deleted, not assigned — assigning undefined leaves the
    // string "undefined" behind and tests a shape no build ever has.
    delete process.env.ENABLE_OBJECT_PROBE;

    liveApi({
      operations: [
        { path: trackPath, type: "set", property: "name", value: "probe" },
      ],
    });

    expect(defaultMock.set).toHaveBeenCalledWith("name", "probe");
    expect(trackMock.set).not.toHaveBeenCalled();
  });
});

// The schema is built at module load, so which shape it has is decided by the
// flag the build was made with — not by the flag at call time.
describe("liveApi tool definition", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ["publishes the per-operation path in a probe build", "true", true],
    ["leaves it out of every other build", undefined, false],
  ])("%s", async (_label, flag, published) => {
    vi.stubEnv("ENABLE_OBJECT_PROBE", flag);
    vi.resetModules();

    const { toolDefLiveApi } =
      await import("#src/tools/advanced/live-api.def.ts");
    const operations = toolDefLiveApi.toolOptions.inputSchema
      .operations as z.ZodArray<z.ZodObject>;

    expect("path" in operations.element.shape).toBe(published);
  });
});
