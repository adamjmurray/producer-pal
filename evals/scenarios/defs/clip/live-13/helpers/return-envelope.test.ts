// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { toolCall, turnsOf } from "../../../helpers/turns-test-helpers.ts";
import { returnClipMisuse, returnEnvelopeProblem } from "./return-envelope.ts";

/**
 * @param events - The Predelay envelope's notation
 * @param overrides - Fields to change on the read
 * @returns A read-clip result for rt1/s0
 */
function read(
  events: string,
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    type: "envelope",
    envelopes: [
      { parameter: "Predelay", device: "rt1/d0", eventCount: 2, events },
    ],
    ...overrides,
  };
}

describe("returnEnvelopeProblem", () => {
  it.each([
    "1|1 0.2 (18.8 ms) / 2|1 0.6 (730 ms)",
    "1|1 0.2 / 1|4 0.6",
    "1|1 0.1 / 1|3 0.4 / 2|1 0.9",
  ])("accepts a steady rise: %s", (events) => {
    expect(returnEnvelopeProblem(read(events))).toBeNull();
  });

  it("names a clip that is no longer an envelope clip", () => {
    expect(
      returnEnvelopeProblem(read("1|1 0.2 / 2|1 0.6", { type: "midi" })),
    ).toMatch(/type midi/);
  });

  it("names more or fewer envelopes than one", () => {
    expect(returnEnvelopeProblem({ type: "envelope" })).toMatch(
      /one envelope, got none/,
    );
  });

  it("names another parameter or device", () => {
    const other = {
      type: "envelope",
      envelopes: [
        { parameter: "Decay", device: "rt1/d0", events: "1|1 0 / 2|1 1" },
      ],
    };

    expect(returnEnvelopeProblem(other)).toMatch(
      /Predelay on rt1\/d0, got Decay/,
    );
  });

  it("wants the first point on beat 1", () => {
    expect(returnEnvelopeProblem(read("1|2 0.2 / 2|1 0.6"))).toMatch(
      /first point.*1\|2/,
    );
  });

  it("wants the last point on beat 4 or later", () => {
    expect(returnEnvelopeProblem(read("1|1 0.2 / 1|3 0.6"))).toMatch(
      /last point.*1\|3/,
    );
  });

  it("wants a rise, and a ramp rather than a jump", () => {
    expect(returnEnvelopeProblem(read("1|1 0.6 / 2|1 0.2"))).toMatch(/rise/);
    expect(returnEnvelopeProblem(read("1|1 0.2 _ 2|1 0.6"))).toMatch(
      /ramp, not jump/,
    );
  });
});

describe("returnClipMisuse", () => {
  it("is empty for reads and a write to the envelope", () => {
    const write = toolCall("ppal-update-clip", {
      path: "rt1/s0",
      envelopes: "767: 1|1 0.2 / 2|1 0.6",
    });

    expect(
      returnClipMisuse(turnsOf([toolCall("ppal-read-clip", {})], [write])),
    ).toStrictEqual([]);
  });

  it("names a create-clip on a return track, and notes sent to a clip", () => {
    const create = toolCall("ppal-create-clip", { path: "rt0/s1" }, "no", true);
    const notes = toolCall("ppal-update-clip", { path: "rt1/s0", notes: "C3" });

    expect(returnClipMisuse(turnsOf([create, notes]))).toStrictEqual([
      "create-clip on rt0/s1",
      "ppal-update-clip sent notes to rt1/s0",
    ]);
  });

  it("lets a create-clip on a normal track pass", () => {
    const create = toolCall("ppal-create-clip", { path: "t3/s2" });

    expect(returnClipMisuse(turnsOf([create]))).toStrictEqual([]);
  });
});
