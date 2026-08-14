// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { isSameSlot } from "../note-sort.ts";

// SAME_TIME_EPSILON is 0.001. The boundary is what the three callers must agree
// on, so it is pinned here rather than in each of them.
describe("isSameSlot()", () => {
  it("matches the same pitch at the same onset", () => {
    expect(
      isSameSlot({ pitch: 60, start_time: 1 }, { pitch: 60, start_time: 1 }),
    ).toBe(true);
  });

  it("does not match a different pitch at the same onset", () => {
    expect(
      isSameSlot({ pitch: 60, start_time: 1 }, { pitch: 61, start_time: 1 }),
    ).toBe(false);
  });

  it("matches onsets closer than the epsilon (round-trip drift)", () => {
    expect(
      isSameSlot(
        { pitch: 60, start_time: 0 },
        { pitch: 60, start_time: 0.0009 },
      ),
    ).toBe(true);
  });

  it("does not match onsets exactly the epsilon apart", () => {
    // Exclusive boundary: 0.001 apart is two different slots.
    expect(
      isSameSlot(
        { pitch: 60, start_time: 0 },
        { pitch: 60, start_time: 0.001 },
      ),
    ).toBe(false);
  });

  it("is symmetric, so caller argument order never matters", () => {
    const a = { pitch: 60, start_time: 0 };
    const b = { pitch: 60, start_time: 0.0009 };

    expect(isSameSlot(a, b)).toBe(isSameSlot(b, a));
    expect(isSameSlot({ pitch: 60, start_time: -1 }, a)).toBe(
      isSameSlot(a, { pitch: 60, start_time: -1 }),
    );
  });
});
