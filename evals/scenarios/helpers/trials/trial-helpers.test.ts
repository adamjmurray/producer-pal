// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseRepeatCount, planTrialLiveSetOpens } from "./trial-helpers.ts";

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

describe("planTrialLiveSetOpens", () => {
  it("reopens the Live Set for every trial by default", () => {
    expect(planTrialLiveSetOpens(3, false, undefined)).toStrictEqual([
      false,
      false,
      false,
    ]);
  });

  it("reuses the open Set after trial 1 when the scenario resets itself", () => {
    expect(planTrialLiveSetOpens(3, false, true)).toStrictEqual([
      false,
      true,
      true,
    ]);
  });

  it("skips trial 1's open when a clean Set is already open", () => {
    expect(planTrialLiveSetOpens(2, true, true)).toStrictEqual([true, true]);
  });

  it("returns one flag per trial", () => {
    expect(planTrialLiveSetOpens(1, false, true)).toStrictEqual([false]);
  });
});
