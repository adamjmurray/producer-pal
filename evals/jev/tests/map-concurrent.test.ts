// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { mapConcurrent } from "../map-concurrent.ts";

describe("mapConcurrent", () => {
  it("keeps input order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapConcurrent([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 6 - n));
      inFlight--;

      return n * 10;
    });

    expect(out).toStrictEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  it("runs one at a time for a limit below 1", async () => {
    expect(await mapConcurrent([1, 2], 0, async (n) => n)).toStrictEqual([
      1, 2,
    ]);
  });
});
