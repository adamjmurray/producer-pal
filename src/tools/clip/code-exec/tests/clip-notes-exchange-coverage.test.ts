// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as v8Console from "#src/shared/max/v8-max-console.ts";
import { describe, expect, it, vi } from "vitest";
import { type CodeNote } from "../code-exec-types.ts";
import { applyNotesToClip } from "../clip-notes-exchange.ts";

describe("applyNotesToClip collision warning", () => {
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
   * A silenced warn spy plus a 4-beat clip stub — the arrangement every
   * collision-warning case needs before calling applyNotesToClip.
   * @returns The warn spy and the clip stub
   */
  function setupCollisionCase() {
    return {
      warn: vi.spyOn(v8Console, "warn").mockImplementation(() => {}),
      mockClip: {
        getProperty: vi.fn().mockReturnValue(4),
        call: vi.fn(),
      } as unknown as LiveAPI,
    };
  }

  it("emits no warning when there are no collisions", () => {
    // Two distinct onsets → collisions === 0 → the `collisions > 0` guard must
    // stay closed (kills the >=0 and forced-true mutants).
    const { warn, mockClip } = setupCollisionCase();

    applyNotesToClip(mockClip, [note(0, 1, 100), note(1, 1, 100)]);

    expect(warn).not.toHaveBeenCalled();
  });

  it("uses the singular noun for exactly one collision", () => {
    // Two same-pitch+start notes → 1 collision → "1 duplicate note" (no "s").
    // Full-string assertion kills the plural-forcing and "s"-blanking mutants.
    const { warn, mockClip } = setupCollisionCase();

    applyNotesToClip(mockClip, [note(0, 1, 100), note(0, 2, 80)]);

    expect(warn).toHaveBeenCalledWith(
      "Dropped 1 duplicate note at the same pitch and start",
    );
  });

  it("uses the plural noun for more than one collision", () => {
    // Three same-pitch+start notes → 2 collisions → "2 duplicate notes".
    // Kills the singular-forcing, blanked-"s", and "Stryker was here!" mutants.
    const { warn, mockClip } = setupCollisionCase();

    applyNotesToClip(mockClip, [
      note(0, 1, 100),
      note(0, 2, 90),
      note(0, 3, 80),
    ]);

    expect(warn).toHaveBeenCalledWith(
      "Dropped 2 duplicate notes at the same pitch and start",
    );
  });
});
