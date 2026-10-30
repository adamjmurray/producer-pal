// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type JevJudgeResult, type JevVerdict } from "../../jev-judge.ts";
import { resolveReference, type Vote } from "../jev-reference.ts";
import { referenceLines } from "../jev-reference-report.ts";
import { formatReport, type CompareEntry } from "../../jev-report.ts";
import { type SkipCounts } from "../../jev-results.ts";

const jev = (verdict: JevVerdict, score = 2): JevJudgeResult => ({
  verdict,
  minProbability: 0.5,
  questions: [],
  outcome: { score, confidence: 0.8, label: "partial success" },
  model: "jev-1",
  inputTokens: 100,
  outputTokens: 5,
  truncated: false,
});

const entry = (
  file: string,
  votes: Array<[string, boolean]>,
  verdict: JevVerdict,
): CompareEntry => {
  const list: Vote[] = votes.map(([slug, pass]) => ({
    slug,
    pass,
    issues: pass ? [] : [`${slug} says no`],
  }));
  const reference = resolveReference(list);

  return {
    file,
    scenarioId: "s",
    judge: {
      pass: reference.majority ?? false,
      issues: [],
      provider: `majority of ${list.length}`,
    },
    reference,
    checksPass: true,
    jev: jev(verdict),
  };
};

const skipped: SkipCounts = {
  notScored: 0,
  noScenario: 0,
  noLlmJudge: 0,
  unreadable: 0,
  staleCriteria: 0,
  jevDecided: 0,
};

const trio = (a: boolean, b: boolean, c: boolean): Array<[string, boolean]> => [
  ["h", a],
  ["l", b],
  ["s", c],
];

describe("referenceLines", () => {
  const entries = [
    entry("u1.json", trio(true, true, true), "pass"),
    entry("u2.json", trio(false, false, false), "pass"), // jev wrong pass
    entry("u3.json", trio(true, true, true), "fail"), // jev wrong fail
    entry("u4.json", trio(true, true, true), "escalate"),
    entry("x1.json", trio(true, false, false), "pass"), // 2-1 fail, split
    entry(
      "t1.json",
      [
        ["h", true],
        ["l", false],
      ],
      "fail",
    ), // tie
  ];
  const text = referenceLines(entries, ["h", "l", "s"]).join("\n");

  it("names the reference judges and reports pairwise agreement", () => {
    expect(text).toContain("LLM judges: h, l, s");
    expect(text).toContain("h vs l: 66.7% (4/6)");
    expect(text).toContain("h vs jev: 40.0% (2/5)");
  });

  it("reports each judge's wrong calls where the others agree", () => {
    expect(text).toContain("jev: n=3, wrong pass 1, wrong fail 1");
    expect(text).toContain("h: n=5, wrong pass 1, wrong fail 0");
  });

  it("reports Jev's escalations", () => {
    expect(text).toContain("Jev escalated on 1 of 6 result(s).");
  });

  it("lists split results with votes, Jev and the failing judges' issues", () => {
    expect(text).toContain(
      "Split results (LLM judges disagree; hand-label these): 2",
    );
    expect(text).toContain("- x1.json (s): h=pass l=fail s=fail jev=pass");
    expect(text).toContain("    l: l says no");
    expect(text).toContain("- t1.json (s): h=pass l=fail jev=fail");
    expect(text).not.toContain("- u1.json (s)");
  });

  it("reports stats for the unanimous results only", () => {
    expect(text).toContain("Checks passed, LLM judges unanimous: n=4");
  });

  it("cuts a long split list", () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      entry(`m${i}.json`, trio(true, false, false), "pass"),
    );
    const out = referenceLines(many, ["h", "l", "s"]).join("\n");

    expect(out).toContain(
      "Split results (LLM judges disagree; hand-label these): 45",
    );
    expect(out).toContain("  ... 5 more in the JSON report");
  });

  it("leaves out results without a Jev answer", () => {
    const out = referenceLines(
      [
        {
          ...entry("e.json", trio(true, true, true), "pass"),
          jev: undefined,
          error: "x",
        },
      ],
      ["h", "l", "s"],
    ).join("\n");

    expect(out).toContain("Jev escalated on 0 of 0 result(s).");
  });
});

describe("formatReport with LLM judge references", () => {
  const entries = [
    entry("u1.json", trio(true, true, true), "pass"),
    entry("x1.json", trio(true, false, false), "fail"), // majority fail, jev right
    entry(
      "t1.json",
      [
        ["h", true],
        ["l", false],
      ],
      "pass",
    ),
  ];
  const text = formatReport(entries, skipped).join("\n");

  it("compares Jev with the majority and leaves ties out", () => {
    expect(text).toContain("Jev vs LLM judges");
    expect(text).toContain("Reference: majority of 3 (2)");
    expect(text).toContain(
      "Compared 2 result(s); 0 Jev error(s); 1 tied (no majority, not counted).",
    );
    expect(text).toContain(
      "Checks passed (the judge decides): n=2, judge fails 1",
    );
    expect(text).toContain("Wrong pass 0, wrong fail 0");
  });
});
