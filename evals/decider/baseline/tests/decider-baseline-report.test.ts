// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type SkipCounts } from "../../decider-results.ts";
import { fakeAnswer, fakeQuestion } from "../../tests/decider-test-helpers.ts";
import { baselineReport, sideName } from "../decider-baseline-report.ts";
import { type BaselineEntry, type LeftOut } from "../decider-baseline-stats.ts";

const skipped: SkipCounts = {
  notScored: 1,
  noScenario: 0,
  noLlmJudge: 2,
  unreadable: 0,
  staleCriteria: 3,
  deciderDecided: 0,
};

const entry = (
  file: string,
  baseline: Parameters<typeof fakeAnswer>[0],
  decider: Parameters<typeof fakeAnswer>[0],
  rest: Partial<BaselineEntry> = {},
): BaselineEntry => ({
  file,
  scenarioId: "a",
  checksPass: true,
  baseline: fakeAnswer(baseline),
  decider: fakeAnswer({
    provider: "ollama",
    model: "autotrust-jev",
    ...decider,
  }),
  ...rest,
});

const report = (entries: BaselineEntry[], leftOut: LeftOut[] = []): string =>
  baselineReport({
    entries,
    leftOut,
    skipped,
    baselineLabel: "typesafe/jev-1 (recorded)",
    deciderLabel: "ollama/autotrust-jev",
  }).join("\n");

describe("sideName", () => {
  const entries = [
    entry("a", {}, {}),
    entry("b", {}, {}),
    entry("c", { model: "jev-2" }, {}),
  ];

  it("names the one model that answered", () => {
    expect(sideName(entries, "decider", "x")).toBe("ollama/autotrust-jev");
  });

  it("counts each model when several answered", () => {
    expect(sideName(entries, "baseline", "x")).toBe(
      "typesafe/jev-1 (2), typesafe/jev-2 (1)",
    );
  });

  it("falls back with no answers", () => {
    expect(sideName([], "baseline", "the recorded answers")).toBe(
      "the recorded answers",
    );
  });
});

describe("baselineReport", () => {
  const entries = [
    entry(
      "run/a.json",
      {
        verdict: "pass",
        questions: [fakeQuestion("r1", 0.9), fakeQuestion("claims", 0.9)],
      },
      {
        verdict: "fail",
        minProbability: 0.1,
        questions: [fakeQuestion("r1", 0.1), fakeQuestion("claims", 0.8)],
      },
      { llmPass: true, baselineSeconds: 2, deciderSeconds: 10 },
    ),
    entry(
      "run/b.json",
      { verdict: "escalate", minProbability: 0.5 },
      { verdict: "escalate", minProbability: 0.6 },
      { deciderSeconds: 20 },
    ),
    entry("run/c.json", { verdict: "pass" }, { verdict: "pass" }),
  ];

  it("names both sides and what was left out", () => {
    const text = report(entries, [
      {
        file: "run/x.json",
        side: "baseline",
        reason: "no saved answer",
        error: false,
      },
      { file: "run/y.json", side: "baseline", reason: "down", error: true },
      { file: "run/z.json", side: "decider", reason: "timeout", error: true },
    ]);

    expect(text).toContain("Baseline: typesafe/jev-1 (recorded)");
    expect(text).toContain("Decider: ollama/autotrust-jev");
    expect(text).toContain(
      "Compared 3 result(s). Left out: 1 with no saved baseline answer, 1 baseline error(s), 1 decider error(s); 1 skipped/error, 0 unknown scenario, 2 scenario without llm_judge, 0 unreadable, 3 recorded before the criteria changed.",
    );
    expect(text).toContain("- run/y.json (baseline): down");
    expect(text).toContain("- run/z.json (decider): timeout");
  });

  it("shows the verdict table, agreement, escalation rates and costly misses", () => {
    const text = report(entries);

    expect(text).toContain("pass       ");
    expect(text).toMatch(/pass\s+1\s+1\s+0/);
    expect(text).toMatch(/escalate\s+0\s+0\s+1/);
    expect(text).toContain(
      "Agreement 66.7% (2/3). Escalation rate: baseline 33.3%, decider 33.3%.",
    );
    expect(text).toContain(
      "Costly disagreements: baseline pass, decider fail 1; baseline fail, decider pass 0.",
    );
  });

  it("compares requirement and claims probabilities separately", () => {
    const text = report(entries);

    expect(text).toContain(
      "Requirement/whole: n=1, mean absolute difference 0.80, correlation n/a, opposite sides of the pass line 1, of the fail line 1",
    );
    expect(text).toContain(
      "Claims: n=1, mean absolute difference 0.10, correlation n/a, opposite sides of the pass line 1, of the fail line 0",
    );
  });

  it("says nothing was answered by both when no questions match", () => {
    expect(report([entry("a", {}, {})])).toContain(
      "Claims: none answered by both",
    );
  });

  it("compares outcomes without a scale note when both used the same one", () => {
    const text = report(entries);

    expect(text).toContain(
      "n=3, correlation n/a, mean difference (decider minus baseline) +0.00",
    );
    expect(text).not.toContain("different scales");
  });

  it("says when the sides used different outcome scales", () => {
    const old = {
      outcome: { score: 3, maxScore: 3, confidence: 1, label: "x" },
    };
    const text = report([
      entry("a", old, {}),
      entry(
        "b",
        { ...old, outcome: { ...old.outcome, score: 1 } },
        { outcome: { score: 2, maxScore: 5, confidence: 1, label: "x" } },
      ),
    ]);

    expect(text).toContain(
      "The sides used different scales: baseline 0-3, decider 0-5",
    );
    expect(text).toContain("(decider minus baseline) +0.03");
  });

  it("reports speed for each side that made calls", () => {
    const text = report(entries);

    expect(text).toContain("Baseline: mean 2.0s, p90 2.0s (n=1)");
    expect(text).toContain("Decider: mean 15.0s, p90 20.0s (n=2)");
    expect(report([entry("a", {}, {})])).toContain("Baseline: no calls");
  });

  it("lists each disagreement with both verdicts, lowest probabilities and the LLM verdict", () => {
    const text = report(entries);

    expect(text).toContain("Disagreements: 1");
    expect(text).toContain("- run/a.json");
    expect(text).toContain(
      "baseline pass (lowest 0.95), decider fail (lowest 0.10); LLM judge pass",
    );
    expect(text).not.toContain("- run/b.json");
  });

  it("says when an escalation came from the claims question, on either side", () => {
    const text = report([
      entry(
        "run/a.json",
        {
          verdict: "escalate",
          escalatedBy: "claims",
          questions: [fakeQuestion("claims", 0.62)],
        },
        { verdict: "pass" },
      ),
      entry(
        "run/b.json",
        { verdict: "pass" },
        { verdict: "escalate", escalatedBy: "claims" },
      ),
    ]);

    expect(text).toContain(
      "baseline escalate by claims 0.62 (lowest 0.95), decider pass (lowest 0.95)",
    );
    expect(text).toContain(
      "baseline pass (lowest 0.95), decider escalate by claims (lowest 0.95)",
    );
  });

  it("omits the LLM verdict when the result has none and cuts a long list", () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      entry(`run/${i}.json`, { verdict: "pass" }, { verdict: "fail" }),
    );
    const text = report(many);

    expect(text).toContain("Disagreements: 45");
    expect(text).not.toContain("LLM judge");
    expect(text).toContain("... 5 more in the JSON report");
  });

  it("copes with no results", () => {
    const text = report([]);

    expect(text).toContain("Agreement n/a (0/0)");
    expect(text).toContain("Disagreements: 0");
  });
});
