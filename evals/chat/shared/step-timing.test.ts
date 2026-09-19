// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for step-timing.ts
 */
import { describe, expect, it } from "vitest";
import { toStepTiming } from "./step-timing.ts";

describe("toStepTiming", () => {
  it("keeps both measurements when both are usable", () => {
    expect(
      toStepTiming({ timeToFirstOutputMs: 1234, outputTokensPerSecond: 42.7 }),
    ).toStrictEqual({
      timeToFirstTokenMs: 1234,
      outputTokensPerSecond: 42.7,
    });
  });

  it("returns undefined when there is no performance data", () => {
    expect(toStepTiming(undefined)).toBeUndefined();
  });

  it("returns undefined when nothing was measurable", () => {
    // A non-streaming step: the SDK leaves both fields unset.
    expect(toStepTiming({})).toBeUndefined();
  });

  it("drops a zeroed rate", () => {
    // The SDK divides by a duration that can be zero and clamps the Infinity
    // to 0, so a single-chunk response reports 0 tok/s. That's "couldn't
    // measure", not a real rate.
    expect(
      toStepTiming({ timeToFirstOutputMs: 900, outputTokensPerSecond: 0 }),
    ).toStrictEqual({ timeToFirstTokenMs: 900 });
  });

  it("drops a zeroed time to first token", () => {
    expect(
      toStepTiming({ timeToFirstOutputMs: 0, outputTokensPerSecond: 30 }),
    ).toStrictEqual({ outputTokensPerSecond: 30 });
  });

  it("drops non-finite values", () => {
    expect(
      toStepTiming({
        timeToFirstOutputMs: Number.NaN,
        outputTokensPerSecond: Number.POSITIVE_INFINITY,
      }),
    ).toBeUndefined();
  });

  it("drops negative values", () => {
    expect(
      toStepTiming({ timeToFirstOutputMs: -5, outputTokensPerSecond: -1 }),
    ).toBeUndefined();
  });
});
