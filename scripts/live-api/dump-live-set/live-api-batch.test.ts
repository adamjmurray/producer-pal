// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fakeInfo,
  installFakeLom,
  type FakeLom,
} from "./dump-live-set-test-helpers.ts";
import {
  createBatchContext,
  liveApiBatch,
  runOperations,
  type Job,
} from "./live-api-batch.ts";

const WIDE_PROPERTY_COUNT = 60;

/**
 * A LOM with one narrow object per track and one very wide object.
 * @returns The fake LOM
 */
function fakeLom(): FakeLom {
  const wide: Record<string, unknown[]> = {};

  for (let at = 0; at < WIDE_PROPERTY_COUNT; at++) {
    wide[`p${String(at)}`] = [at];
  }

  return {
    types: { Track: fakeInfo("Track", ["property name unicode"]) },
    objects: {
      "live_set tracks 0": {
        id: "2",
        type: "Track",
        properties: { name: ["Drums"], color: [16711680], arm: [1] },
      },
      "live_set tracks 1": {
        id: "3",
        type: "Track",
        properties: { name: ["Bass"], color: [255], arm: [0] },
      },
      "live_set tracks 2": { id: "4", type: "Track", properties: wide },
    },
  };
}

/**
 * Read three named properties off a track.
 * @param index - Track index
 * @returns The job
 */
function narrowJob(index: number): Job {
  return {
    path: `live_set tracks ${String(index)}`,
    ops: ["name", "color", "arm"].map((property) => ({
      type: "get" as const,
      property,
    })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("liveApiBatch", () => {
  it("carries several objects in one request", async () => {
    const calls = installFakeLom(fakeLom());
    const ctx = createBatchContext("http://fake");

    const results = await liveApiBatch(ctx, [narrowJob(0), narrowJob(1)]);

    expect(results).toStrictEqual([
      [["Drums"], [16711680], [1]],
      [["Bass"], [255], [0]],
    ]);
    // Two set_paths and six reads, so one request rather than two.
    expect(calls.requests).toStrictEqual([8]);
  });

  it("splits an object with more reads than one request holds", async () => {
    const calls = installFakeLom(fakeLom());
    const ctx = createBatchContext("http://fake");

    const [results] = await liveApiBatch(ctx, [
      {
        path: "live_set tracks 2",
        ops: Array.from({ length: WIDE_PROPERTY_COUNT }, (_unused, at) => ({
          type: "get" as const,
          property: `p${String(at)}`,
        })),
      },
    ]);

    // Order matters: the caller pairs these back up with the names it asked for.
    expect(results).toStrictEqual(
      Array.from({ length: WIDE_PROPERTY_COUNT }, (_unused, at) => [at]),
    );
    // 49 reads plus a set_path fills a request; the rest follow in a second.
    expect(calls.requests).toStrictEqual([50, 12]);
  });

  it("isolates an unreadable property instead of losing the object", async () => {
    const lom = fakeLom();

    lom.failing = new Set(["live_set tracks 1:color"]);

    const calls = installFakeLom(lom);
    const ctx = createBatchContext("http://fake");

    const results = await liveApiBatch(ctx, [narrowJob(0), narrowJob(1)]);

    expect(results).toStrictEqual([
      [["Drums"], [16711680], [1]],
      [["Bass"], null, [0]],
    ]);
    expect(ctx.stats.failedOps).toBe(1);
    // The first request fails as a whole, so the reads are halved until the one
    // that cannot be read is on its own.
    expect(calls.requests.length).toBeGreaterThan(1);
  });

  it("asks for nothing when a job has no reads", async () => {
    const calls = installFakeLom(fakeLom());
    const ctx = createBatchContext("http://fake");

    const results = await liveApiBatch(ctx, [
      { path: "live_set tracks 0", ops: [] },
    ]);

    expect(results).toStrictEqual([[]]);
    expect(calls.requests).toStrictEqual([]);
  });
});

describe("runOperations", () => {
  it("throws when the server refuses the request", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response),
    );

    await expect(
      runOperations(createBatchContext("http://fake"), [{ type: "info" }]),
    ).rejects.toThrow("HTTP 404 Not Found");
  });
});
