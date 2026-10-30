// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type StateAssertion } from "../../../../types.ts";
import { velocityShaping } from "../velocity-shaping.ts";

const state = velocityShaping.assertions.find(
  (a) => a.type === "state" && a.tool === "ppal-read-clip",
) as StateAssertion;
const crescendo = { expect: state.expect as (result: unknown) => boolean };

/** What a read of the drum clip returns, with bar 2's last two beats as given. */
const clipWith = (lastTwoBeats: string): unknown => ({
  timeSignature: "4/4",
  notes: `v100 n/8 Ab1 1|1x8 E1 1|2 n/16 ${lastTwoBeats}`,
});

const hits = (velocities: number[]): string =>
  velocities.map((v, i) => `v${v} Ab1 2|${3 + i / 4}`).join(" ");

describe("velocityShaping crescendo outcome", () => {
  it("passes a quiet-to-max rise across the hats", () => {
    const notes = hits([16, 32, 48, 64, 80, 96, 112, 127]);

    expect(crescendo.expect(clipWith(notes))).toBe(true);
  });

  it("fails a rise that never gets loud", () => {
    const notes = hits([16, 25, 35, 45, 55, 65, 75, 85]);

    expect(crescendo.expect(clipWith(notes))).toBe(false);
  });

  it("fails a rise that starts too loud", () => {
    const notes = hits([80, 85, 90, 95, 100, 105, 110, 127]);

    expect(crescendo.expect(clipWith(notes))).toBe(false);
  });

  it("fails hats left at one velocity", () => {
    const notes = hits([100, 100, 100, 100, 100, 100, 100, 100]);

    expect(crescendo.expect(clipWith(notes))).toBe(false);
  });

  it("fails a fall", () => {
    const notes = hits([127, 112, 96, 80, 64, 48, 32, 16]);

    expect(crescendo.expect(clipWith(notes))).toBe(false);
  });
});
