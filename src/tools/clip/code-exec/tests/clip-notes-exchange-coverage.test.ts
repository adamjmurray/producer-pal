// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import * as v8Console from "#src/shared/max/v8-max-console.ts";
import { describe, expect, it, vi } from "vitest";
import { type CodeNote } from "../code-exec-types.ts";
import { applyNotesToClip } from "../clip-notes-exchange.ts";

describe("applyNotesToClip dropped duplicates", () => {
  function note(start: number, duration: number, velocity: number): CodeNote {
    return {
      pitch: 60,
      start,
      duration,
      velocity,
      velocityDeviation: 0,
      probability: 1,
    };
  }

  /**
   * A 4-beat clip stub, as every case needs before calling applyNotesToClip.
   * @returns The clip stub
   */
  function setupCollisionCase() {
    return {
      mockClip: {
        getProperty: vi.fn().mockReturnValue(4),
        call: vi.fn(() => JSON.stringify({ notes: [] })),
      } as unknown as LiveAPI,
    };
  }

  it.each([
    {
      desc: "drops nothing and warns nothing when there are no collisions",
      notes: [note(0, 1, 100), note(1, 1, 100)],
      expectedDropped: 0,
    },
    {
      desc: "returns the count for one collision, and does not warn",
      notes: [note(0, 1, 100), note(0, 2, 80)],
      expectedDropped: 1,
    },
  ])("$desc", ({ notes, expectedDropped }) => {
    const warn = vi.spyOn(v8Console, "warn").mockImplementation(() => {});
    const { mockClip } = setupCollisionCase();

    const { collisions: dropped } = applyNotesToClip(mockClip, notes);

    expect(dropped).toBe(expectedDropped);
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns the count for more than one collision", () => {
    const { mockClip } = setupCollisionCase();

    const { collisions: dropped } = applyNotesToClip(mockClip, [
      note(0, 1, 100),
      note(0, 2, 90),
      note(0, 3, 80),
    ]);

    expect(dropped).toBe(2);
  });

  it("returns 0 for no notes", () => {
    const { mockClip } = setupCollisionCase();

    expect(applyNotesToClip(mockClip, []).collisions).toBe(0);
  });
});
