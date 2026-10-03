// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { liveApi } from "#src/tools/advanced/live-api.ts";

const MISSING_METHOD = 'Method "nope" not found on LiveAPI object';

describe("liveApi when an operation throws at runtime", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    liveSet = registerMockObject("1", { path: livePath.liveSet, type: "Song" });
  });

  it("keeps the results before the failure and runs nothing after it", () => {
    const result = liveApi({
      operations: [
        { type: "set-property", property: "tempo", value: 130 },
        { type: "call-method", method: "nope" },
        { type: "set-property", property: "tempo", value: 140 },
      ],
    });

    expect(result).toStrictEqual({
      id: "1",
      results: [130],
      failed: { index: 1, detail: MISSING_METHOD },
    });
    expect(liveSet.set).toHaveBeenCalledTimes(1);
    expect(liveSet.set).toHaveBeenCalledWith("tempo", 130);
  });

  it("reports a throw from Live itself the same way", () => {
    liveSet.set.mockImplementationOnce(() => {
      throw new Error("Live rejected the write");
    });

    const result = liveApi({
      operations: [
        { type: "exists" },
        { type: "get-field", property: "id" },
        { type: "set", property: "tempo", value: 130 },
      ],
    });

    expect(result.results).toHaveLength(2);
    expect(result.failed).toStrictEqual({
      index: 2,
      detail: "Live rejected the write",
    });
  });

  it("reports a failure at the last operation", () => {
    const result = liveApi({
      operations: [{ type: "exists" }, { type: "call-method", method: "nope" }],
    });

    expect(result.results).toHaveLength(1);
    expect(result.failed).toStrictEqual({ index: 1, detail: MISSING_METHOD });
  });

  it("still reports the path the object was moved to", () => {
    registerMockObject("track-0", { path: livePath.track(0), type: "Track" });

    const result = liveApi({
      operations: [
        { type: "set-path", value: String(livePath.track(0)) },
        { type: "call-method", method: "nope" },
      ],
    });

    expect(result.path).toBe(String(livePath.track(0)));
    expect(result.results).toStrictEqual([String(livePath.track(0))]);
    expect(result.failed?.index).toBe(1);
  });

  it("throws when the first operation fails, since nothing changed", () => {
    let caught: unknown;

    try {
      liveApi({
        operations: [
          { type: "call-method", method: "nope" },
          { type: "set-property", property: "tempo", value: 140 },
        ],
      });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toBe(
      `operations[0] (counting from 0): ${MISSING_METHOD}`,
    );
    expect(((caught as Error).cause as Error).message).toBe(MISSING_METHOD);
    expect(liveSet.set).not.toHaveBeenCalled();
  });

  it("has no failed key when every operation ran", () => {
    expect(liveApi({ operations: [{ type: "exists" }] })).not.toHaveProperty(
      "failed",
    );
  });
});
