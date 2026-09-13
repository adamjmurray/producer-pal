// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

// A toPath naming a lane or slot fully determines one place, so it can't cover
// more than one clip. Refused before any Live read - `id` alone never
// resolves against Live, so these throw with no mocks at all.
describe("updateClip - refuses one toPath place for several clips", () => {
  it.each([
    ["an arrangement spot", "t0[5|1]", "spot"],
    ["a take lane", "t0/l0[5|1]", "spot"],
    ["a session slot", "t0/s1", "slot"],
  ])("refuses %s shared by 2 ids", async (_label, toPath, noun) => {
    await expect(updateClip({ id: "1,2", toPath })).rejects.toThrow(
      `2 clips can't share one ${noun}; give one toPath per clip, or a bare ` +
        `[pos] to keep each clip's own track`,
    );
  });

  it("refuses a lane with no position, shared by 3 ids", async () => {
    await expect(updateClip({ id: "1,2,3", toPath: "t0" })).rejects.toThrow(
      "3 clips can't share one spot",
    );
  });

  // Neither id resolves to a real clip, so a call that gets past the refusal
  // just returns an empty result - these ids only exist to prove the refusal
  // did NOT fire.

  // A bare coordinate names no lane, so each clip keeps its own - it broadcasts
  // instead of refusing.
  it("does not refuse a bare position shared by several ids", async () => {
    await expect(
      updateClip({ id: "1,2", toPath: "[5|1]" }),
    ).resolves.toStrictEqual([]);
  });

  // One id: nothing to share, so the lane destination is fine.
  it("does not refuse a lane destination for a single id", async () => {
    await expect(
      updateClip({ id: "1", toPath: "t0[5|1]" }),
    ).resolves.toStrictEqual([]);
  });

  // N destinations for N ids already pair 1:1; nothing here is shared.
  it("does not refuse one destination per id", async () => {
    await expect(
      updateClip({ id: "1,2", toPath: "t0[5|1],t1[9|1]" }),
    ).resolves.toStrictEqual([]);
  });
});
