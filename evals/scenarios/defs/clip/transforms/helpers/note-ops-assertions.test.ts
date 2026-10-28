// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type CustomAssertion,
  type EvalAssertion,
  type EvalTurnResult,
  type StateAssertion,
} from "../../../../types.ts";
import {
  noteOpOutcome,
  usedTransform,
  wroteNotesDirectly,
} from "./note-ops-assertions.ts";

const updateTurn = (args: Record<string, unknown>): EvalTurnResult[] => [
  {
    turnIndex: 0,
    userMessage: "",
    assistantResponse: "",
    toolCalls: [{ name: "ppal-update-clip", args, result: "{}" }],
    durationMs: 0,
  },
];

const run = (a: EvalAssertion, turns: EvalTurnResult[]): boolean =>
  (a as CustomAssertion).assert(turns);

describe("usedTransform", () => {
  const split = usedTransform(0, /split\(/, "split()");

  it("passes when the transforms string matches", () => {
    expect(run(split, updateTurn({ transforms: "split(2|1)" }))).toBe(true);
  });

  it("fails naming the transform it saw instead", () => {
    expect(() => run(split, updateTurn({ transforms: "pitch += 1" }))).toThrow(
      "expected split(): pitch += 1",
    );
  });

  it("fails when notes were written instead", () => {
    expect(() => run(split, updateTurn({ notes: "C3 1|1" }))).toThrow(
      "transforms parameter missing",
    );
  });
});

describe("wroteNotesDirectly", () => {
  const direct = wroteNotesDirectly(0);

  it("passes when notes were written and no transform used", () => {
    expect(run(direct, updateTurn({ notes: "C3 1|1" }))).toBe(true);
  });

  it("fails when a transform was used", () => {
    expect(() =>
      run(direct, updateTurn({ notes: "C3 1|1", transforms: "split(2|1)" })),
    ).toThrow("used transforms");
  });

  it("fails when no notes were written", () => {
    expect(() => run(direct, updateTurn({ split: "2|1" }))).toThrow(
      "wrote notes",
    );
  });
});

describe("noteOpOutcome", () => {
  const outcome = noteOpOutcome({
    target: () => ({ path: "t0/s0" }),
    check: (after) => (after.length === 1 ? null : "want one note"),
    length: "1bar",
  }) as StateAssertion;
  const expectFn = outcome.expect as (r: unknown) => boolean;

  it("reads the notes and timing of the target", () => {
    expect((outcome.args as () => unknown)()).toStrictEqual({
      path: "t0/s0",
      include: ["notes", "timing"],
    });
  });

  it("passes when the check is satisfied", () => {
    expect(expectFn({ notes: "C3 1|1", length: "1bar" })).toBe(true);
  });

  it("fails and explains when the check is not", () => {
    const result = { notes: "C3 1|1 D3 1|2", length: "1bar" };

    expect(expectFn(result)).toBe(false);
    expect(outcome.explain?.(result)).toBe("want one note");
  });

  it("fails when the clip length changed", () => {
    const result = { notes: "C3 1|1", length: "2bar" };

    expect(outcome.explain?.(result)).toBe(
      "clip length should stay 1bar, is 2bar",
    );
  });

  it("fails on notes that do not parse", () => {
    const result = { notes: "not notes at all", length: "1bar" };

    expect(outcome.explain?.(result)).toBe("the clip's notes did not parse");
  });
});
