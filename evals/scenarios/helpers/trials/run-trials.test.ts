// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { toJsonResult } from "../json-results/result-conversion.ts";
import { type JsonEvalResult } from "../json-results/types.ts";
import { writeJsonResult } from "../json-results/writer.ts";
import { type RunEnv } from "../../run-env/run-env.ts";
import { runScenario } from "../../run-scenario.ts";
import { type EvalScenario, type EvalScenarioResult } from "../../types.ts";
import { runTrial, type RunContext } from "./run-trials.ts";

vi.mock(import("../../run-scenario.ts"), () => ({ runScenario: vi.fn() }));
vi.mock(import("../json-results/result-conversion.ts"), () => ({
  toJsonResult: vi.fn(
    (scenarioResult: EvalScenarioResult) =>
      ({
        result: scenarioResult.error == null ? "pass" : "error",
      }) as JsonEvalResult,
  ),
}));
vi.mock(import("../json-results/writer.ts"), () => ({
  writeJsonResult: vi.fn(),
}));
vi.mock(import("../reporting/result-printer.ts"), () => ({
  printResultBlock: vi.fn(),
}));

const SPEC = { provider: "openai", model: "m" } as ModelSpec;
const RUN_ENV = {} as RunEnv;

const ctx = (repeatCount: number, save = false): RunContext => ({
  runId: "r",
  judgeOverride: SPEC,
  repeatCount,
  options: { save },
});

const scenario = (): EvalScenario => ({ id: "s" }) as EvalScenario;

describe("runTrial", () => {
  beforeEach(() => {
    vi.mocked(runScenario).mockReset();
    vi.mocked(runScenario).mockResolvedValue({} as EvalScenarioResult);
    vi.mocked(toJsonResult).mockClear();
    vi.mocked(writeJsonResult).mockClear();
  });

  it.each([true, false])(
    "passes a Live Set already open (%s) on to the run",
    async (opened) => {
      await runTrial(scenario(), SPEC, RUN_ENV, "default", ctx(2), 1, opened);

      expect(vi.mocked(runScenario).mock.calls[0]?.[1].skipLiveSetOpen).toBe(
        opened,
      );
    },
  );

  it("skips the open under --skip-setup", async () => {
    await runTrial(
      scenario(),
      SPEC,
      RUN_ENV,
      "default",
      { ...ctx(1), options: { skipSetup: true } },
      1,
      false,
    );

    expect(vi.mocked(runScenario).mock.calls[0]?.[1].skipLiveSetOpen).toBe(
      true,
    );
  });

  it("hands the Jev settings to the run", async () => {
    await runTrial(
      scenario(),
      SPEC,
      RUN_ENV,
      "default",
      { ...ctx(1), jev: { route: "vercel" } },
      1,
      false,
    );

    expect(vi.mocked(runScenario).mock.calls[0]?.[1].jev).toStrictEqual({
      route: "vercel",
    });
  });

  it("numbers the trial when repeating", async () => {
    await runTrial(scenario(), SPEC, RUN_ENV, "default", ctx(3), 2, false);

    expect(vi.mocked(toJsonResult).mock.calls[0]?.[4]).toStrictEqual({
      trial: 2,
      totalTrials: 3,
    });
  });

  it("leaves a single run unnumbered", async () => {
    await runTrial(scenario(), SPEC, RUN_ENV, "default", ctx(1), 1, false);

    expect(vi.mocked(toJsonResult).mock.calls[0]?.[4]).toBeUndefined();
  });

  it("saves the result as soon as the trial finishes unless --no-save", async () => {
    await runTrial(
      scenario(),
      SPEC,
      RUN_ENV,
      "default",
      ctx(1, true),
      1,
      false,
    );
    await runTrial(
      scenario(),
      SPEC,
      RUN_ENV,
      "default",
      ctx(1, false),
      1,
      false,
    );

    expect(writeJsonResult).toHaveBeenCalledTimes(1);
  });
});
