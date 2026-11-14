// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EvalScenario } from "#evals/scenarios/types.ts";
import { runDeciderCompare } from "../../decider-compare.ts";
import { type deciderJudge } from "../../decider-judge.ts";
import {
  fakeAnswer,
  fakeQuestion,
  makeRunDir,
} from "../../tests/decider-test-helpers.ts";

type Judge = typeof deciderJudge;

const saved = (verdict: string, minProbability: number, maxScore = 5) => ({
  provider: "typesafe",
  verdict,
  model: "jev-saved",
  minProbability,
  questions: [{ id: "req1", kind: "requirement", probability: minProbability }],
  outcome: {
    score: maxScore,
    maxScore,
    level: "complete success",
    confidence: 1,
  },
  inputTokens: 5,
  outputTokens: 1,
  truncated: false,
});

const resultJson = (judge?: unknown): string =>
  JSON.stringify({
    scenarioId: "a",
    timestamp: "2026-10-29T00:00:00Z",
    result: "pass",
    ...(judge != null && { judge }),
    turns: [
      { turnIndex: 0, userMessage: "u", assistantResponse: "r", toolCalls: [] },
    ],
    checks: { pass: true, results: [] },
  });

describe("baseline comparison", () => {
  let dir: string;
  const log = vi.fn();
  const scenarios = [
    { id: "a", assertions: [{ type: "llm_judge", prompt: "1. Req." }] },
  ] as unknown as EvalScenario[];
  const output = (): string => log.mock.calls.flat().join("\n");
  const run = (
    argv: string[],
    decider: Judge,
    baselineResolved?: { provider: "typesafe" | "ollama"; model: string },
  ) =>
    runDeciderCompare([...argv, `--results-dir=${dir}`], {
      decider,
      resolved: { provider: "ollama", model: "autotrust-jev" },
      ...(baselineResolved && { baselineResolved }),
      log,
      load: { scenarios, criteriaDate: () => undefined },
    });
  const answering =
    (verdict: "pass" | "fail" | "escalate", model = "autotrust-jev"): Judge =>
    async () =>
      fakeAnswer({
        provider: "ollama",
        model,
        verdict,
        minProbability: 0.2,
        questions: [fakeQuestion("req1", 0.2)],
      });
  const write = (name: string, judge?: unknown) =>
    writeFile(join(dir, "run1", name), resultJson(judge));

  beforeEach(async () => {
    log.mockClear();
    dir = await makeRunDir("decider-baseline-");
    // Decided by the decider in the run: no LLM verdict
    await write("a.json", {
      pass: true,
      issues: [],
      decidedBy: "decider",
      decider: saved("pass", 0.95),
    });
    // Escalated: the LLM judge decided
    await write("b.json", {
      pass: false,
      issues: [],
      decidedBy: "llm",
      llm: { pass: false, issues: [] },
      decider: saved("escalate", 0.5),
    });
    // Run without a decider
    await write("c.json", { pass: true, issues: [] });
    // The decider call failed in the run
    await write("d.json", {
      pass: true,
      issues: [],
      decidedBy: "llm",
      decider: {
        provider: "typesafe",
        verdict: "error",
        escalationReason: "down",
      },
    });
    // No judge at all
    await write("e.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  describe("--baseline=recorded", () => {
    it("uses decider-decided results and leaves out missing and failed baselines", async () => {
      const decider = vi.fn(answering("fail"));

      await run(["run1", "--baseline=recorded"], decider);

      expect(decider).toHaveBeenCalledTimes(2); // a.json and b.json only
      expect(output()).toContain("on 2 of 2 saved result(s)");
      expect(output()).toContain("Baseline: typesafe/jev-saved (recorded)");
      expect(output()).toContain("Decider: ollama/autotrust-jev");
      expect(output()).toContain(
        "Compared 2 result(s). Left out: 1 with no saved baseline answer, 1 baseline error(s), 0 decider error(s)",
      );
      expect(output()).toContain("- run1/d.json (baseline): down");
    });

    it("lists the disagreements with the stored LLM verdict where there is one", async () => {
      await run(["run1", "--baseline=recorded"], answering("fail"));

      expect(output()).toContain("Disagreements: 2");
      expect(output()).toContain(
        "baseline pass (lowest 0.95), decider fail (lowest 0.20)\n",
      );
      expect(output()).toContain(
        "baseline escalate (lowest 0.50), decider fail (lowest 0.20); LLM judge fail",
      );
    });

    it("applies --limit to the results that have a baseline", async () => {
      const decider = vi.fn(answering("fail"));

      await run(["run1", "--baseline=recorded", "--limit=1"], decider);

      expect(decider).toHaveBeenCalledTimes(1);
      expect(output()).toContain("on 1 of 2 saved result(s)");
    });

    it("keeps --scenario working", async () => {
      const decider = vi.fn(answering("fail"));

      await run(["run1", "--baseline=recorded", "--scenario=other"], decider);

      expect(decider).not.toHaveBeenCalled();
      expect(output()).toContain("Compared 0 result(s)");
    });

    it("says when the recorded outcome scale differs", async () => {
      await write("a.json", {
        pass: true,
        issues: [],
        decidedBy: "decider",
        decider: saved("pass", 0.95, 3),
      });
      await run(["run1", "--baseline=recorded"], answering("fail"));

      expect(output()).toContain(
        "The sides used different scales: baseline 0-3 and 0-5, decider 0-5",
      );
    });

    it("writes a baseline report into the results directory", async () => {
      await run(["run1", "--baseline=recorded"], answering("fail"));

      const files = await readdir(dir);
      const name = files.find((f) => f.startsWith("decider-compare-"));
      const text = await readFile(join(dir, name ?? ""), "utf8");
      const json = JSON.parse(text);

      expect(json.mode).toBe("baseline");
      expect(json.entries).toHaveLength(2);
      expect(json.leftOut).toHaveLength(2);
      expect(json.entries[1].llmPass).toBe(false);
      expect(json.entries[0]).not.toHaveProperty("llmPass");
    });
  });

  describe("--baseline=<decider>", () => {
    const typesafe = { provider: "typesafe", model: "jev-1.14.0" } as const;

    it("calls both deciders on every judged result, whoever decided it", async () => {
      const decider = vi.fn(async (..._args: Parameters<Judge>) =>
        fakeAnswer({ model: "jev-1.14.0", verdict: "pass" }),
      );

      await run(["run1", "--baseline=jev"], decider, typesafe);

      // a, b, c and d are judged results; e has no judge
      expect(decider).toHaveBeenCalledTimes(8);

      const asked = decider.mock.calls.map((c) => c[2]);

      expect(asked.filter((o) => o?.provider === "typesafe")).toHaveLength(4);
      expect(asked.filter((o) => o?.provider === "ollama")).toHaveLength(4);
      expect(output()).toContain("Baseline: typesafe/jev-1.14.0 (fresh)");
      expect(output()).toContain("Speed (seconds per call)");
      expect(output()).toMatch(/Baseline: mean \d+\.\ds/);
      expect(output()).toMatch(/Decider: mean \d+\.\ds/);
    });

    it("leaves out a result whose baseline or decider call failed", async () => {
      const decider: Judge = async (_run, _criteria, options) => {
        if (options?.provider === "typesafe") {
          throw new Error("jev down");
        }

        return fakeAnswer({ provider: "ollama", model: "m" });
      };

      await run(["run1", "--baseline=jev"], decider, typesafe);

      expect(output()).toContain("Compared 0 result(s)");
      expect(output()).toContain("4 baseline error(s)");
      expect(output()).toContain("- run1/a.json (baseline): jev down");
    });

    it("leaves out a result whose decider call failed", async () => {
      const decider: Judge = async (_run, _criteria, options) => {
        if (options?.provider === "ollama") {
          throw new Error("ollama down");
        }

        return fakeAnswer();
      };

      await run(["run1", "--baseline=jev"], decider, typesafe);

      expect(output()).toContain("4 decider error(s)");
      expect(output()).toContain("- run1/a.json (decider): ollama down");
    });

    it("lets a hosted baseline run in parallel while ollama sees one call at a time", async () => {
      const active = { ollama: 0, typesafe: 0 };
      const peak = { ollama: 0, typesafe: 0 };

      const decider: Judge = async (_run, _criteria, options) => {
        const p = options?.provider === "ollama" ? "ollama" : "typesafe";

        active[p]++;
        peak[p] = Math.max(peak[p], active[p]);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active[p]--;

        return fakeAnswer({ provider: p });
      };

      await run(["run1", "--baseline=jev"], decider, typesafe);

      expect(peak.ollama).toBe(1);
      expect(peak.typesafe).toBeGreaterThan(1);
    });

    it("compares two ollama models one call at a time", async () => {
      let active = 0;
      let peak = 0;

      const decider: Judge = async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;

        return fakeAnswer({ provider: "ollama" });
      };

      await run(["run1", "--baseline=ollama/other"], decider, {
        provider: "ollama",
        model: "other",
      });

      expect(peak).toBe(1);
    });
  });
});
