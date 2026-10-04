// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { type JsonEvalResult } from "../json-results/types.ts";
import { type RunEnv } from "../../run-env/run-env.ts";
import { runScenario } from "../../run-scenario.ts";
import { type EvalScenario, type EvalScenarioResult } from "../../types.ts";
import { runTrials, type RunContext } from "./run-trials.ts";

vi.mock(import("../../run-scenario.ts"), () => ({ runScenario: vi.fn() }));
vi.mock(import("../json-results/result-conversion.ts"), () => ({
  toJsonResult: vi.fn(
    (scenarioResult: EvalScenarioResult) =>
      ({
        result: scenarioResult.error == null ? "pass" : "error",
      }) as JsonEvalResult,
  ),
}));
vi.mock(import("../reporting/result-printer.ts"), () => ({
  printResultBlock: vi.fn(),
}));
vi.mock(import("./multi-trial-runs.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  printTrialSummary: vi.fn(),
}));

const SPEC = { provider: "openai", model: "m" } as ModelSpec;
const RUN_ENV = {} as RunEnv;

const ctx = (repeatCount: number): RunContext => ({
  runId: "r",
  judgeOverride: SPEC,
  repeatCount,
  options: { save: false },
});

const scenario = (reuseLiveSet?: boolean): EvalScenario =>
  ({ id: "s", reuseLiveSet }) as EvalScenario;

/** Queue one scenario result per trial; a string is an error message. */
function queueResults(outcomes: Array<string | null>): void {
  for (const error of outcomes) {
    vi.mocked(runScenario).mockResolvedValueOnce(
      (error == null ? {} : { error }) as EvalScenarioResult,
    );
  }
}

const skipFlags = (): unknown[] =>
  vi.mocked(runScenario).mock.calls.map(([, o]) => o.skipLiveSetOpen);

describe("runTrials Live Set reuse", () => {
  beforeEach(() => {
    vi.mocked(runScenario).mockReset();
  });

  it("reopens the Set after a trial that failed to open it", async () => {
    queueResults(["Live Set open failed", null, null]);

    await runTrials(scenario(true), SPEC, RUN_ENV, "default", ctx(3), false);

    expect(skipFlags()).toStrictEqual([false, false, true]);
  });

  it("reuses the Set across trials that all ran", async () => {
    queueResults([null, null, null]);

    await runTrials(scenario(true), SPEC, RUN_ENV, "default", ctx(3), false);

    expect(skipFlags()).toStrictEqual([false, true, true]);
  });

  it("still opens every trial for a scenario that does not reuse the Set", async () => {
    queueResults([null, null]);

    await runTrials(scenario(), SPEC, RUN_ENV, "default", ctx(2), false);

    expect(skipFlags()).toStrictEqual([false, false]);
  });
});
