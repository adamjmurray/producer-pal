// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for saving eval results to disk.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import {
  type ConfigProfile,
  type EvalScenario,
  type EvalScenarioResult,
} from "#evals/scenarios/types.ts";
import { saveResults } from "../save-results.ts";
import { type ResultsByScenario } from "../report-table.ts";

const tmpBase = mkdtempSync(join(tmpdir(), "ppal-eval-"));

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

const scenario: EvalScenario = {
  id: "demo",
  description: "demo scenario",
  liveSet: "basic-midi-4-track",
  messages: ["Connect to Ableton Live"],
  assertions: [],
};

const result: EvalScenarioResult = {
  scenario,
  turns: [
    {
      turnIndex: 0,
      userMessage: "Connect to Ableton Live",
      assistantResponse: "Connected.",
      toolCalls: [{ name: "ppal-connect", args: {}, result: "ok" }],
      durationMs: 500,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    },
  ],
  assertions: [
    {
      assertion: { type: "tool_called", tool: "ppal-connect" },
      earned: 5,
      maxScore: 5,
      message: "called",
    },
  ],
  earnedScore: 5,
  maxScore: 5,
  totalDurationMs: 500,
  usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
};

const resultsByScenario: ResultsByScenario = new Map([
  ["demo", new Map([["anthropic/claude", new Map([["default", result]])]])],
]);

const modelSpecs: ModelSpec[] = [{ provider: "anthropic", model: "claude" }];
const configProfiles: ConfigProfile[] = [
  { id: "default", description: "default", config: {} },
];

describe("saveResults", () => {
  it("writes results.json and report.md to a timestamped directory", () => {
    const outDir = saveResults(
      resultsByScenario,
      modelSpecs,
      configProfiles,
      tmpBase,
    );

    expect(existsSync(join(outDir, "results.json"))).toBe(true);
    expect(existsSync(join(outDir, "report.md"))).toBe(true);
  });

  it("serializes scenario scores and tool calls into the JSON", () => {
    const outDir = saveResults(
      resultsByScenario,
      modelSpecs,
      configProfiles,
      tmpBase,
    );
    const json = JSON.parse(readFileSync(join(outDir, "results.json"), "utf8"));

    const run = json.scenarios.demo["anthropic/claude"];

    expect(run.earnedScore).toBe(5);
    expect(run.maxScore).toBe(5);
    expect(run.percentage).toBe(100);
    expect(run.turns[0].toolCalls[0].name).toBe("ppal-connect");
    expect(run.usage.inputTokens).toBe(100);
    expect(run.turns[0].usage.outputTokens).toBe(50);
  });

  it("includes the scenario score in the Markdown report", () => {
    const outDir = saveResults(
      resultsByScenario,
      modelSpecs,
      configProfiles,
      tmpBase,
    );
    const md = readFileSync(join(outDir, "report.md"), "utf8");

    expect(md).toContain("# Eval Results");
    expect(md).toContain("demo");
    expect(md).toContain("100%");
  });
});
