// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EvalScenario } from "#evals/scenarios/types.ts";
import { loadJudgedResults } from "../jev-results.ts";

const scenario = (id: string, prompt: string): EvalScenario =>
  ({
    id,
    assertions: [{ type: "llm_judge", prompt }],
  }) as unknown as EvalScenario;

const resultJson = (scenarioId: string, timestamp: string): string =>
  JSON.stringify({
    scenarioId,
    timestamp,
    result: "pass",
    judge: { pass: true, issues: [] },
    turns: [],
    checks: { pass: true, results: [] },
  });

describe("loadJudgedResults", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-results-"));
    await mkdir(join(dir, "run1"));
    await writeFile(
      join(dir, "run1", "old.json"),
      resultJson("a", "2026-01-01T00:00:00Z"),
    );
    await writeFile(
      join(dir, "run1", "new.json"),
      resultJson("a", "2026-03-01T00:00:00Z"),
    );
    await writeFile(
      join(dir, "run1", "undated.json"),
      resultJson("b", "2026-01-01T00:00:00Z"),
    );
    // The run record sits beside the results and is never one.
    await writeFile(join(dir, "run1", "run.json"), '{"argv":[],"options":{}}');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  const scenarios = [scenario("a", "Prompt A"), scenario("b", "Prompt B")];

  it("skips results recorded before the criteria changed", async () => {
    const criteriaDate = vi.fn((prompt: string) =>
      prompt === "Prompt A" ? "2026-02-01T00:00:00Z" : undefined,
    );
    const { items, skipped } = await loadJudgedResults({
      resultsDir: dir,
      scenarios,
      criteriaDate,
    });

    expect(items.map((i) => i.file).toSorted()).toStrictEqual([
      join("run1", "new.json"),
      join("run1", "undated.json"),
    ]);
    expect(skipped.staleCriteria).toBe(1);
  });

  it("looks up each scenario once", async () => {
    const criteriaDate = vi.fn(() => "2026-02-01T00:00:00Z");

    await loadJudgedResults({ resultsDir: dir, scenarios, criteriaDate });

    expect(criteriaDate).toHaveBeenCalledTimes(2);
  });

  it("only looks up scenarios that appear in the results", async () => {
    const criteriaDate = vi.fn(() => undefined);

    await loadJudgedResults({
      resultsDir: dir,
      scenarios: [...scenarios, scenario("c", "Prompt C")],
      criteriaDate,
    });

    expect(criteriaDate).not.toHaveBeenCalledWith("Prompt C");
  });

  it("keeps stale results when asked", async () => {
    const { items, skipped } = await loadJudgedResults({
      resultsDir: dir,
      scenarios,
      criteriaDate: () => "2026-02-01T00:00:00Z",
      includeStale: true,
    });

    expect(items).toHaveLength(3);
    expect(skipped.staleCriteria).toBe(0);
  });

  it("loads results with no stored judge only when asked", async () => {
    await writeFile(
      join(dir, "run1", "unjudged.json"),
      JSON.stringify({
        scenarioId: "a",
        timestamp: "2026-03-01T00:00:00Z",
        result: "pass",
        turns: [],
        checks: { pass: true, results: [] },
      }),
    );

    const plain = await loadJudgedResults({ resultsDir: dir, scenarios });
    const all = await loadJudgedResults({
      resultsDir: dir,
      scenarios,
      includeUnjudged: true,
    });

    expect(plain.items).toHaveLength(3);
    expect(all.items).toHaveLength(4);
  });

  it("leaves out Jev-decided results only when asked for LLM verdicts", async () => {
    await writeFile(
      join(dir, "run1", "jev.json"),
      JSON.stringify({
        scenarioId: "a",
        timestamp: "2026-03-01T00:00:00Z",
        result: "pass",
        judge: { pass: true, issues: [], decidedBy: "jev" },
        turns: [],
        checks: { pass: true, results: [] },
      }),
    );

    const both = await loadJudgedResults({ resultsDir: dir, scenarios });
    const llm = await loadJudgedResults({
      resultsDir: dir,
      scenarios,
      llmVerdictOnly: true,
    });

    expect(both.items).toHaveLength(4);
    expect(both.skipped.jevDecided).toBe(0);
    expect(llm.items).toHaveLength(3);
    expect(llm.skipped.jevDecided).toBe(1);
  });

  it("hands judges the text of a result's injected blocks", async () => {
    await mkdir(join(dir, "run1", "blocks"));
    await writeFile(
      join(dir, "run1", "blocks", "0123456789abcdef.txt"),
      "Everything is up to date.",
    );
    await writeFile(
      join(dir, "run1", "with-blocks.json"),
      JSON.stringify({
        ...JSON.parse(resultJson("b", "2026-03-01T00:00:00Z")),
        turns: [
          {
            userMessage: "",
            assistantResponse: "",
            toolCalls: [
              {
                name: "ppal-connect",
                args: {},
                injectedBlocks: ["0123456789abcdef"],
              },
            ],
          },
        ],
      }),
    );

    const { items } = await loadJudgedResults({
      resultsDir: dir,
      scenarios,
      scenarioIds: ["b"],
      includeStale: true,
    });
    const loaded = items.find((i) => i.file.endsWith("with-blocks.json"));

    expect(loaded?.result.turns[0]?.toolCalls[0]?.injectedBlocks).toStrictEqual(
      ["Everything is up to date."],
    );
  });
});
