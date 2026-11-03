// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { bandLines, claimsLines } from "../jev-bands.ts";
import { type JevJudgeResult } from "../../jev-judge.ts";

const answer = (
  verdict: JevJudgeResult["verdict"],
  req: number,
  claims?: number,
  whole = 0.95,
): JevJudgeResult => ({
  verdict,
  minProbability: Math.min(req, whole),
  questions: [
    {
      id: "req1",
      kind: "requirement",
      text: "Confirmed   it",
      probability: req,
    },
    { id: "whole", kind: "whole", text: "All", probability: whole },
    ...(claims == null
      ? []
      : [
          {
            id: "claims",
            kind: "claims" as const,
            text: "C",
            probability: claims,
          },
        ]),
  ],
  outcome: { score: 3, confidence: 1, label: "complete success" },
  model: "jev",
  inputTokens: 1,
  outputTokens: 1,
  truncated: false,
});

const entry = (
  file: string,
  scenarioId: string,
  judgePass: boolean,
  jev: JevJudgeResult,
) => ({ file, scenarioId, judge: { pass: judgePass }, jev });

describe("bandLines", () => {
  it("counts answers between the thresholds, most uncertain requirement first", () => {
    const lines = bandLines([
      entry("a", "s1", true, answer("escalate", 0.5)),
      entry("b", "s1", true, answer("escalate", 0.6)),
      entry("c", "s1", true, answer("pass", 0.9)),
      entry("d", "s2", true, answer("escalate", 0.7)),
      entry("e", "s2", true, { ...answer("pass", 0.95), questions: [] }),
      { file: "f", scenarioId: "s2", judge: { pass: true } },
    ]);

    expect(lines[0]).toContain("between 0.3 and 0.85");
    expect(lines[1]).toBe("  s1 req1: 2/3/2  Confirmed it");
    expect(lines[2]).toBe("  s2 req1: 1/1/1  Confirmed it");
    expect(lines).toHaveLength(3);
  });

  it("leaves the claims question out, and says none when nothing is in band", () => {
    const lines = bandLines([
      entry("a", "s1", true, answer("escalate", 0.95, 0.5)),
    ]);

    expect(lines.at(-1)).toBe("  (none)");
  });

  it("lists at most twelve requirements", () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      entry("f", `s${i}`, true, answer("escalate", 0.5)),
    );

    expect(bandLines(entries)).toHaveLength(13);
  });
});

describe("claimsLines", () => {
  it("says so when the answers have no claims question", () => {
    expect(
      claimsLines([entry("a", "s", true, answer("pass", 0.9))]),
    ).toStrictEqual(["Claims question: not in these answers"]);
  });

  it("counts passes turned into escalations, and the ones the reference failed", () => {
    const lines = claimsLines([
      entry("clean", "s", true, answer("pass", 0.95, 0.9)),
      {
        ...entry("caught", "s", false, answer("escalate", 0.95, 0.3)),
        runLlmPass: false,
      },
      {
        ...entry("extra", "s", true, answer("escalate", 0.95, 0.6)),
        runLlmPass: true,
      },
      entry("failing", "s", false, answer("escalate", 0.5, 0.2)),
    ]);

    expect(lines[0]).toContain("asked on 4, below 0.7 on 3");
    expect(lines[1]).toContain(
      "Would otherwise have passed: 2; the reference failed 1 of them",
    );
    expect(lines[1]).toContain("passed 1 (extra escalations)");
    expect(lines).toContain(
      "  caught: claims 0.30; reference fail; LLM judge in the run fail",
    );
    expect(lines).toContain(
      "  extra: claims 0.60; reference pass; LLM judge in the run pass",
    );
    expect(lines).toHaveLength(4);
  });

  it("says n/a when the LLM judge did not run in the run", () => {
    const lines = claimsLines([
      entry("x", "s", true, answer("escalate", 0.95, 0.3)),
    ]);

    expect(lines.at(-1)).toBe(
      "  x: claims 0.30; reference pass; LLM judge in the run n/a",
    );
  });
});
