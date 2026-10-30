// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EvalScenario } from "#evals/scenarios/types.ts";
import { parseArgs, runJevCompare } from "../jev-compare.ts";
import { type JevJudgeResult } from "../jev-judge.ts";
import { criteriaHash, writeSidecar } from "../sidecar-judges/jev-sidecar.ts";

describe("parseArgs --via", () => {
  it("is unset by default", () => {
    expect(parseArgs([]).via).toBeUndefined();
  });

  it.each(["typesafe", "openrouter", "vercel"] as const)(
    "accepts %s",
    (route) => {
      expect(parseArgs([`--via=${route}`]).via).toBe(route);
    },
  );

  it("rejects an unknown route, naming the choices", () => {
    expect(() => parseArgs(["--via=nowhere"])).toThrow(
      "Unknown --via=nowhere; use one of typesafe, openrouter, vercel",
    );
  });

  it("does not treat the flag as a run id", () => {
    expect(parseArgs(["run-1", "--via=vercel"]).runIds).toStrictEqual([
      "run-1",
    ]);
  });
});

describe("parseArgs --recorded", () => {
  it("is off by default and on with the flag", () => {
    expect(parseArgs([]).recorded).toBe(false);
    expect(parseArgs(["--recorded"]).recorded).toBe(true);
  });
});

describe("parseArgs --reference and --results-dir", () => {
  it("defaults to the stored verdict and evals/results", () => {
    const args = parseArgs([]);

    expect(args.references).toStrictEqual([]);
    expect(args.resultsDir).toBe("evals/results");
  });

  it("reads repeatable references as slugs, from a slug or provider/model", () => {
    expect(
      parseArgs([
        "--reference=codex-code_luna",
        "--reference=anthropic/claude-haiku-5-5",
      ]).references,
    ).toStrictEqual(["codex-code_luna", "anthropic_claude-haiku-5-5"]);
  });

  it("reads the results directory", () => {
    expect(parseArgs(["--results-dir=/tmp/r"]).resultsDir).toBe("/tmp/r");
  });
});

describe("runJevCompare", () => {
  let dir: string;
  const log = vi.fn();
  const jevAnswer = (verdict: JevJudgeResult["verdict"]): JevJudgeResult => ({
    verdict,
    minProbability: 0.5,
    questions: [],
    outcome: { score: 2, confidence: 0.5, label: "partial success" },
    model: "jev-1",
    inputTokens: 10,
    outputTokens: 1,
    truncated: false,
  });
  const scenarios = [
    { id: "a", assertions: [{ type: "llm_judge", prompt: "Prompt A" }] },
  ] as unknown as EvalScenario[];
  const run = (argv: string[], jev = vi.fn(async () => jevAnswer("pass"))) =>
    runJevCompare([...argv, `--results-dir=${dir}`], {
      jev,
      route: "typesafe",
      log,
      load: { scenarios, criteriaDate: () => undefined },
    });
  const resultJson = (judge?: {
    pass: boolean;
    issues: string[];
    decidedBy?: string;
    jev?: unknown;
    llm?: unknown;
  }): string =>
    JSON.stringify({
      scenarioId: "a",
      timestamp: "2026-10-29T00:00:00Z",
      result: "pass",
      ...(judge && { judge }),
      turns: [
        {
          turnIndex: 0,
          userMessage: "u",
          assistantResponse: "r",
          toolCalls: [],
        },
      ],
      checks: { pass: true, results: [] },
    });
  const vote = (
    file: string,
    slug: string,
    pass: boolean,
    criteria = "Prompt A",
  ) =>
    writeSidecar(dir, {
      version: 1,
      file,
      scenarioId: "a",
      slug,
      judge: { provider: "p" },
      criteriaHash: criteriaHash(criteria),
      judgedAt: "2026-10-29T00:00:00Z",
      durationMs: 1,
      checksPass: true,
      pass,
      issues: pass ? [] : [`${slug} issue`],
    });
  const output = (): string => log.mock.calls.flat().join("\n");

  beforeEach(async () => {
    log.mockClear();
    dir = await mkdtemp(join(tmpdir(), "jev-compare-"));
    await mkdir(join(dir, "run1"));
    await writeFile(
      join(dir, "run1", "a.json"),
      resultJson({ pass: true, issues: [] }),
    );
    await writeFile(join(dir, "run1", "b.json"), resultJson());
    await writeFile(join(dir, "run1", "c.json"), resultJson());
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("compares with the stored verdict and skips results without one", async () => {
    const jev = vi.fn(async () => jevAnswer("fail"));

    await run(["run1"], jev);

    expect(jev).toHaveBeenCalledTimes(1);
    expect(output()).toContain("Jev vs stored judge");
    expect(output()).toContain("Wrong pass 0, wrong fail 1");
  });

  it("leaves out results Jev decided in the run, and says so", async () => {
    await writeFile(
      join(dir, "run1", "d.json"),
      resultJson({ pass: false, issues: [], decidedBy: "jev" }),
    );
    await writeFile(
      join(dir, "run1", "e.json"),
      resultJson({ pass: true, issues: [], decidedBy: "llm" }),
    );

    const jev = vi.fn(async () => jevAnswer("pass"));

    await run(["run1"], jev);

    expect(jev).toHaveBeenCalledTimes(2); // a.json and e.json, not d.json
    expect(output()).toContain("Compared 2 result(s)");
    expect(output()).toContain("1 decided by Jev in the run (no LLM verdict");
  });

  it("uses a Jev-decided result when sidecar judges are the reference", async () => {
    await writeFile(
      join(dir, "run1", "d.json"),
      resultJson({ pass: false, issues: [], decidedBy: "jev" }),
    );
    await vote("run1/d.json", "h", true);

    const jev = vi.fn(async () => jevAnswer("pass"));

    await run(["run1", "--reference=h"], jev);

    expect(jev).toHaveBeenCalledTimes(1);
    expect(output()).not.toContain("decided by Jev in the run");
  });

  it("writes the report into the results directory", async () => {
    await run(["run1"]);

    const files = await readdir(dir);
    const report = files.find((f) => f.startsWith("jev-compare-"));

    expect(report).toBeDefined();
    expect(
      JSON.parse(await readFile(join(dir, report ?? ""), "utf8")).entries,
    ).toHaveLength(1);
  });

  it("uses sidecar judges as the reference, even for results with no stored verdict", async () => {
    await vote("run1/b.json", "h", false);
    await vote("run1/b.json", "l", false);
    await vote("run1/c.json", "h", true);
    await vote("run1/c.json", "l", false); // tie

    const jev = vi.fn(async () => jevAnswer("pass"));

    await run(["run1", "--reference=h", "--reference=l"], jev);

    expect(jev).toHaveBeenCalledTimes(2); // a.json has no sidecar
    expect(output()).toContain("Jev vs LLM judges");
    expect(output()).toContain("Wrong pass 1, wrong fail 0");
    expect(output()).toContain("1 tied (no majority, not counted)");
    expect(output()).toContain("h vs l: 50.0% (1/2)");
    expect(output()).toContain("- c.json".replace("c.json", "run1/c.json"));
    expect(output()).toContain(
      "Judge (majority of 2): fail - h issue | l issue",
    );
  });

  it("names a single reference judge and ignores its verdicts on other criteria", async () => {
    await vote("run1/b.json", "h", true);
    await vote("run1/c.json", "h", true, "older criteria");

    await run(["run1", "--reference=h"]);

    expect(output()).toContain("Compared 1 result(s)");
    expect(output()).toContain("Reference: h (1)");
  });

  it("records a Jev failure instead of throwing", async () => {
    await vote("run1/b.json", "h", true);

    await run(
      ["run1", "--reference=h"],
      vi.fn(async () => {
        throw new Error("jev down");
      }),
    );

    expect(output()).toContain("run1/b.json: jev down");
  });

  it("limits how many results go to Jev", async () => {
    await vote("run1/b.json", "h", true);
    await vote("run1/c.json", "h", true);

    const jev = vi.fn(async () => jevAnswer("pass"));

    await run(["run1", "--reference=h", "--limit=1"], jev);

    expect(jev).toHaveBeenCalledTimes(1);
  });

  describe("--recorded", () => {
    const savedJev = (verdict: string, claims: number) => ({
      route: "typesafe",
      verdict,
      model: "jev-1",
      minProbability: 0.95,
      questions: [
        { id: "req1", kind: "requirement", probability: 0.95 },
        { id: "whole", kind: "whole", probability: 0.95 },
        { id: "claims", kind: "claims", probability: claims },
      ],
      outcome: { score: 3, level: "complete success", confidence: 1 },
      inputTokens: 5,
      outputTokens: 1,
      truncated: false,
    });

    it("reads the answers saved in the run and never calls Jev", async () => {
      await writeFile(
        join(dir, "run1", "d.json"),
        resultJson({
          pass: false,
          issues: [],
          decidedBy: "llm",
          llm: { pass: false, issues: [] },
          jev: savedJev("escalate", 0.4),
        }),
      );
      await writeFile(
        join(dir, "run1", "e.json"),
        resultJson({
          pass: true,
          issues: [],
          decidedBy: "jev",
          jev: savedJev("pass", 0.9),
        }),
      );
      await vote("run1/d.json", "h", false);
      await vote("run1/e.json", "h", true);
      await vote("run1/b.json", "h", true); // no saved Jev answer

      const jev = vi.fn(async () => jevAnswer("pass"));

      await run(["run1", "--reference=h", "--recorded"], jev);

      expect(jev).not.toHaveBeenCalled();
      expect(output()).toContain("Reading the recorded Jev answer of 3 of 3");
      expect(output()).toContain("1 result(s) have no saved Jev answer");
      expect(output()).toContain("Compared 2 result(s)");
      expect(output()).toContain("recorded in the run");
      expect(output()).toContain("Jev pass 1, fail 0, escalate 1");
      expect(output()).toContain("Claims question");
      expect(output()).toContain(
        "run1/d.json: claims 0.40; reference fail; LLM judge in the run fail",
      );
    });

    it("records a Jev call that failed in the run as an error", async () => {
      await writeFile(
        join(dir, "run1", "d.json"),
        resultJson({
          pass: true,
          issues: [],
          decidedBy: "llm",
          jev: {
            route: "typesafe",
            verdict: "error",
            escalationReason: "down",
          },
        }),
      );
      await vote("run1/d.json", "h", true);

      await run(["run1", "--reference=h", "--recorded"]);

      expect(output()).toContain("run1/d.json: down");
    });
  });
});
