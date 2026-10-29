// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type JevJudgeResult, type JevVerdict } from "../jev-judge.ts";
import { formatReport, type CompareEntry } from "../jev-report.ts";
import { type SkipCounts } from "../jev-results.ts";

const skipped: SkipCounts = {
  notScored: 0,
  noScenario: 0,
  noLlmJudge: 0,
  unreadable: 0,
  staleCriteria: 4,
};

const jevResult = (verdict: JevVerdict, p: number): JevJudgeResult => ({
  verdict,
  minProbability: p,
  questions: [
    { id: "req1", kind: "requirement", text: "A", probability: p },
    { id: "whole", kind: "whole", text: "A", probability: 0.9 },
  ],
  model: "jev-1.14.0",
  inputTokens: 1000,
  outputTokens: 5,
  truncated: false,
});

const entry = (
  file: string,
  judgePass: boolean,
  verdict: JevVerdict,
  checksPass = true,
  withJudge = true,
): CompareEntry => ({
  file,
  scenarioId: "s",
  judge: {
    pass: judgePass,
    issues: judgePass ? [] : ["bad reply"],
    ...(withJudge && { provider: "codex-code", model: "luna" }),
  },
  checksPass,
  jev: jevResult(verdict, verdict === "pass" ? 0.95 : 0.1),
});

describe("formatReport", () => {
  const entries = [
    entry("a.json", true, "pass"),
    entry("b.json", false, "pass"),
    entry("c.json", true, "fail"),
    entry("d.json", false, "escalate"),
    entry("e.json", false, "pass", false),
    { ...entry("f.json", true, "pass"), jev: undefined, error: "boom" },
  ];
  const text = formatReport(entries, skipped).join("\n");

  it("reports stats for the checks-passed subset and for all results", () => {
    expect(text).toContain(
      "Checks passed (the judge decides): n=4, judge fails 2",
    );
    expect(text).toContain("All results: n=5, judge fails 3");
    expect(text).toContain("Jev pass 3, fail 1, escalate 1 (20.0%)");
    expect(text).toContain("Wrong pass 1, wrong fail 1");
  });

  it("counts the stored judges, most common first, and names them", () => {
    const mixed = [
      entry("a.json", true, "pass"),
      entry("b.json", true, "pass"),
      entry("c.json", true, "pass", true, false),
      { ...entry("d.json", true, "pass"), jev: undefined, error: "x" },
    ];
    const out = formatReport(mixed, skipped).join("\n");

    expect(out).toContain("Stored judge: codex-code/luna (2), unknown (1)");
    expect(text).toContain("Stored judge: codex-code/luna (5)");
  });

  it("lists wrong passes and wrong fails, not escalations", () => {
    expect(text).toContain("- b.json (wrong pass)");
    expect(text).toContain("checks passed");
    expect(text).toContain("Judge (codex-code/luna): fail - bad reply");
    expect(text).toContain("req1=0.95 whole=0.90");
    expect(text).toContain("- c.json (wrong fail)");
    expect(text).toContain("- e.json (wrong pass)");
    expect(text).toContain("checks failed");
    expect(text).not.toContain("- d.json");
  });

  it("mentions stale skips, errors and cost", () => {
    expect(text).toContain("4 recorded before the criteria changed");
    expect(text).toContain("- f.json: boom");
    expect(text).toContain("Jev input tokens: 5000 (~$0.0002 estimated)");
  });

  it("names the route and counts the model versions that answered", () => {
    const mixed = [
      entry("a.json", true, "pass"),
      entry("b.json", true, "pass"),
      entry("c.json", true, "pass"),
    ];

    mixed[2] = {
      ...mixed[2],
      jev: { ...jevResult("pass", 0.95), model: "jev-1.15.0" },
    } as CompareEntry;

    const out = formatReport(mixed, skipped, "openrouter").join("\n");

    expect(out).toContain("Jev: openrouter, jev-1.14.0 (2), jev-1.15.0 (1)");
  });

  it("sums the actual cost when every answer has one", () => {
    const priced = [
      entry("a.json", true, "pass"),
      entry("b.json", true, "pass"),
    ];

    for (const e of priced) {
      e.jev = { ...(e.jev as JevJudgeResult), cost: 0.0123 };
    }

    const out = formatReport(priced, skipped).join("\n");

    expect(out).toContain("Jev input tokens: 2000 (actual $0.0246)");
  });

  it("keeps the estimate when any answer lacks a cost", () => {
    const partial = [
      entry("a.json", true, "pass"),
      entry("b.json", true, "pass"),
    ];

    partial[0] = {
      ...partial[0],
      jev: { ...jevResult("pass", 0.95), cost: 0.5 },
    } as CompareEntry;

    const out = formatReport(partial, skipped).join("\n");

    expect(out).toContain("(~$0.0001 estimated)");
    expect(out).not.toContain("actual");
  });

  it("says none when there are no wrong calls", () => {
    const out = formatReport([entry("a.json", true, "pass")], skipped);

    expect(out.join("\n")).toContain("Wrong calls:\n  (none)");
  });
});
