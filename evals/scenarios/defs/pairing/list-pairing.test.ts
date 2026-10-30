// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type EvalScenario, type StateAssertion } from "../../types.ts";
import {
  arrangementDestinationPairing,
  duplicateDestinationPairing,
} from "./list-pairing.ts";

const states = (scenario: EvalScenario): StateAssertion[] =>
  scenario.assertions.filter((a) => a.type === "state");

const track = (...bars: string[]): unknown => ({
  arrangementClips: bars.map((bar) => ({ path: `t0[${bar}]` })),
});

describe("duplicateDestinationPairing", () => {
  const [drums, bass] = states(duplicateDestinationPairing) as [
    StateAssertion,
    StateAssertion,
  ];
  const check = (a: StateAssertion, result: unknown): boolean =>
    (a.expect as (r: unknown) => boolean)(result);

  it("passes the requested copies", () => {
    expect(check(drums, track("1|1", "9|1"))).toBe(true);
    expect(check(bass, track("5|1", "13|1"))).toBe(true);
  });

  it("passes copies the model tiled with a longer arrangementLength", () => {
    expect(check(drums, track("1|1", "3|1", "9|1", "11|1"))).toBe(true);
    expect(check(bass, track("5|1", "7|1", "13|1", "15|1"))).toBe(true);
  });

  it("fails a missing copy", () => {
    expect(check(drums, track("1|1", "3|1"))).toBe(false);
  });

  it("fails a stray clip that is not a tiled repeat", () => {
    expect(check(drums, track("1|1", "2|1", "9|1"))).toBe(false);
    expect(check(drums, track("1|1", "9|1", "9|3"))).toBe(false);
  });
});

describe("arrangementDestinationPairing", () => {
  it("still wants exactly the requested clips", () => {
    const [drums] = states(arrangementDestinationPairing) as [StateAssertion];
    const expectFn = drums.expect as (r: unknown) => boolean;

    expect(expectFn(track("1|1", "9|1"))).toBe(true);
    expect(expectFn(track("1|1", "3|1", "9|1"))).toBe(false);
  });
});
