// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import {
  type JsonEvalResult,
  type JsonDeciderAnswer,
  type JsonJudge,
} from "../../json-results/types.ts";
import { printResult, printResultBlock } from "../result-printer.ts";
import { type ResultsByScenario } from "../report-table.ts";
import { printSummary } from "../summary-printer.ts";

vi.mock(import("../report-table.ts"), () => ({ printResultsTable: vi.fn() }));

const deciderAnswer: JsonDeciderAnswer = {
  route: "typesafe",
  verdict: "pass",
  model: "decider-1",
  minProbability: 0.93,
  questions: [],
  outcome: { score: 3, level: "complete success", confidence: 0.9 },
  inputTokens: 40,
  outputTokens: 4,
  truncated: false,
};

const result = (judge: JsonJudge): JsonEvalResult => ({
  version: 2,
  runId: "r",
  timestamp: "2026-10-29T00:00:00Z",
  scenarioId: "s",
  scenarioDescription: "d",
  model: "google/m",
  configProfileId: "default",
  result: "pass",
  turns: [],
  checks: { pass: true, results: [] },
  judge,
  totalDurationMs: 1,
});

const deciderJudge: JsonJudge = {
  pass: true,
  issues: [],
  decidedBy: "decider",
  decider: deciderAnswer,
};

const byScenario = (results: JsonEvalResult[]): ResultsByScenario =>
  new Map([["s", new Map([["google/m", new Map([["default", results]])]])]]);

describe("The decider in run output", () => {
  let log: ReturnType<typeof vi.spyOn>;
  const output = (): string => log.mock.calls.flat().join("\n");
  const specs = (n: number): ModelSpec[] =>
    Array.from({ length: n }, () => ({ provider: "google", model: "m" }));

  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("notes who decided under the saved result's judge section", () => {
    printResult(result(deciderJudge));

    expect(output()).toContain(
      "The decider decided: pass (outcome: complete success, lowest answer 0.93)",
    );
  });

  it("tags the judge line of the RESULT block with who decided", () => {
    printResultBlock(result(deciderJudge));

    expect(output()).toContain("Judge:");
    expect(output()).toContain("(decider, complete success)");
  });

  it("tags an escalated verdict as the LLM judge's", () => {
    printResultBlock(
      result({
        pass: false,
        issues: [],
        decidedBy: "llm",
        decider: { route: "typesafe", verdict: "error", escalationReason: "x" },
      }),
    );

    expect(output()).toContain("(LLM judge, after the decider escalated)");
  });

  it("prints no decider note for a judge the decider was not asked about", () => {
    printResultBlock(result({ pass: true, issues: [] }));

    expect(output()).not.toContain("The decider");
  });

  it("totals the decider calls in a single-model summary", () => {
    printSummary(byScenario([result(deciderJudge)]), specs(1), "default");

    expect(output()).toContain(
      "The decider judge: 1 call(s); decided 1 (1 pass, 0 fail)",
    );
    expect(output()).toContain("The decider tokens: 40 in, 4 out");
  });

  it("totals the decider calls under the multi-model table too", () => {
    printSummary(byScenario([result(deciderJudge)]), specs(2), "default");

    expect(output()).toContain("The decider judge: 1 call(s)");
  });

  it("prints no decider totals for a run without the decider", () => {
    printSummary(
      byScenario([result({ pass: true, issues: [] })]),
      specs(1),
      "default",
    );

    expect(output()).not.toContain("The decider");
  });
});
