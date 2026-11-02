// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type JsonEvalResult } from "../json-results/types.ts";
import {
  liveSetLeftClean,
  liveSetLeftOpen,
  parseRepeatCount,
} from "./multi-trial-runs.ts";

describe("parseRepeatCount", () => {
  it("defaults to a single trial", () => {
    expect(parseRepeatCount(undefined)).toBe(1);
  });

  it("parses a positive integer", () => {
    expect(parseRepeatCount("3")).toBe(3);
  });

  it.each(["0", "-1", "abc"])("rejects %s", (value) => {
    expect(() => parseRepeatCount(value)).toThrow(/positive integer/);
  });
});

describe("liveSetLeftOpen", () => {
  const run = (result: JsonEvalResult["result"]): JsonEvalResult =>
    ({ result }) as JsonEvalResult;

  it("is true after a run that got past the open", () => {
    expect(liveSetLeftOpen(run("pass"))).toBe(true);
    expect(liveSetLeftOpen(run("fail"))).toBe(true);
  });

  it("is false when the run errored", () => {
    expect(liveSetLeftOpen(run("error"))).toBe(false);
  });
});

describe("liveSetLeftClean", () => {
  const run = (result: JsonEvalResult["result"]): JsonEvalResult =>
    ({ result }) as JsonEvalResult;

  it("is true after a reuseLiveSet scenario that ran", () => {
    expect(liveSetLeftClean(true, run("pass"))).toBe(true);
  });

  it("is false after a scenario that does not reset what it writes", () => {
    expect(liveSetLeftClean(undefined, run("pass"))).toBe(false);
    expect(liveSetLeftClean(false, run("fail"))).toBe(false);
  });

  it("is false after a reuseLiveSet scenario that errored", () => {
    expect(liveSetLeftClean(true, run("error"))).toBe(false);
  });
});
