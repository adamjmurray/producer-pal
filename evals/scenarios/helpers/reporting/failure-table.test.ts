// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type JsonEvalResult } from "../json-results/types.ts";
import { buildFailureTable } from "./failure-table.ts";

function trial(
  scenarioId: string,
  model: string,
  result: JsonEvalResult["result"],
  error?: string,
): JsonEvalResult {
  return {
    scenarioId,
    model,
    result,
    kind: "capability",
    ...(error != null && { error }),
  } as JsonEvalResult;
}

const SONNET = "anthropic/claude-sonnet-5-5";
const TERRA = "codex-code/gpt-6.1-terra";

describe("buildFailureTable", () => {
  it("lists only scenarios a model failed, with every model's tally and totals", () => {
    const run = [
      trial("a", SONNET, "pass"),
      trial("a", SONNET, "fail"),
      trial("a", TERRA, "pass"),
      trial("b", SONNET, "pass"),
      trial("b", TERRA, "pass"),
    ];

    expect(buildFailureTable([run])).toBe(
      [
        `| scenario | kind | ${SONNET} | ${TERRA} |`,
        "| --- | --- | --- | --- |",
        "| `a` | capability | 1/2 | 1/1 |",
        "| **total** |  | 2/3 (2 scenarios) | 2/2 (2 scenarios) |",
      ].join("\n"),
    );
  });

  it("lets a newer run replace the trials it repeats, per model", () => {
    const first = [trial("a", SONNET, "fail"), trial("a", TERRA, "fail")];
    const rerun = [trial("a", SONNET, "pass")];

    expect(buildFailureTable([first, rerun])).toContain(
      "| `a` | capability | 1/1 | 0/1 |",
    );
  });

  it("ignores errors, skips, and fails the provider refused", () => {
    const run = [
      trial("a", TERRA, "fail", "codex CLI error: You’ve hit your usage limit"),
      trial("a", TERRA, "error", "Live would not swap Sets"),
      trial("a", TERRA, "skipped"),
      trial("b", TERRA, "fail", "timed out"),
    ];

    expect(buildFailureTable([run])).toBe(
      [
        `| scenario | kind | ${TERRA} |`,
        "| --- | --- | --- |",
        "| `b` | capability | 0/1 |",
        "| **total** |  | 0/1 (1 scenarios) |",
      ].join("\n"),
    );
  });

  it("shows a dash for a model that never graded a failing scenario", () => {
    const run = [trial("a", SONNET, "fail"), trial("b", TERRA, "pass")];

    expect(buildFailureTable([run])).toContain(
      "| `a` | capability | 0/1 | — |",
    );
  });
});
