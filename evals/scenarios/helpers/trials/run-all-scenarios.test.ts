// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { type RunEnv } from "../../run-env/run-env.ts";
import { type EvalScenario } from "../../types.ts";
import { shouldSkipScenario } from "../json-results/skip-scenario.ts";
import { type JsonEvalResult } from "../json-results/types.ts";
import { printTrialSummary } from "./multi-trial-runs.ts";
import { runAllScenarios } from "./run-all-scenarios.ts";
import { MAX_CONSECUTIVE_ERRORED_TRIALS } from "./run-abort.ts";
import { emitSkipped, runTrial, type RunContext } from "./run-trials.ts";

vi.mock(import("../json-results/skip-scenario.ts"), () => ({
  shouldSkipScenario: vi.fn(),
  buildSkippedResult: vi.fn(),
}));
vi.mock(import("./multi-trial-runs.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  printTrialSummary: vi.fn(),
}));
vi.mock(import("./run-trials.ts"), () => ({
  runTrial: vi.fn(),
  emitSkipped: vi.fn(),
}));

const A = { provider: "openai", model: "a" } as ModelSpec;
const B = { provider: "openai", model: "b" } as ModelSpec;
const RUN_ENV = {} as RunEnv;

const ctx = (repeatCount: number): RunContext => ({
  runId: "r",
  judgeOverride: A,
  repeatCount,
  options: { save: false },
});

const scenario = (
  id: string,
  extra: Partial<EvalScenario> = {},
): EvalScenario => ({ id, liveSet: "set-1", ...extra }) as EvalScenario;

const result = (value: JsonEvalResult["result"]): JsonEvalResult =>
  ({ result: value }) as JsonEvalResult;

/** Results to hand back, keyed `scenario/model/trial`; anything else passes. */
let outcomes: Record<string, JsonEvalResult["result"]> = {};

/** `scenario/model/trial` for each trial run, in order. */
const order = (): string[] =>
  vi
    .mocked(runTrial)
    .mock.calls.map(
      ([s, spec, , , , trial]) => `${s.id}/${spec.model}/${trial}`,
    );

/** The skip-the-open flag handed to each trial, in order. */
const skipFlags = (): boolean[] =>
  vi.mocked(runTrial).mock.calls.map(([, , , , , , opened]) => opened);

beforeEach(() => {
  outcomes = {};
  vi.mocked(runTrial).mockReset();
  vi.mocked(emitSkipped).mockReset();
  vi.mocked(shouldSkipScenario).mockReset();
  vi.mocked(printTrialSummary).mockClear();
  vi.mocked(shouldSkipScenario).mockReturnValue(null);
  vi.mocked(runTrial).mockImplementation(
    async (s, spec, _env, _label, _ctx, trial) =>
      await Promise.resolve(
        result(outcomes[`${s.id}/${spec.model}/${trial}`] ?? "pass"),
      ),
  );
  vi.mocked(emitSkipped).mockImplementation(
    async () => await Promise.resolve([result("skipped")]),
  );
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("runAllScenarios ordering", () => {
  it("runs every scenario once before any scenario's second trial", async () => {
    await runAllScenarios(
      [scenario("s1"), scenario("s2")],
      [A],
      RUN_ENV,
      "default",
      ctx(3),
    );

    expect(order()).toStrictEqual([
      "s1/a/1",
      "s2/a/1",
      "s1/a/2",
      "s2/a/2",
      "s1/a/3",
      "s2/a/3",
    ]);
  });

  it("runs every model on every scenario in each round", async () => {
    await runAllScenarios(
      [scenario("s1"), scenario("s2")],
      [A, B],
      RUN_ENV,
      "default",
      ctx(2),
    );

    expect(order()).toStrictEqual([
      "s1/a/1",
      "s1/b/1",
      "s2/a/1",
      "s2/b/1",
      "s1/a/2",
      "s1/b/2",
      "s2/a/2",
      "s2/b/2",
    ]);
  });

  it("collects each cell's trials in order under its scenario and model", async () => {
    outcomes = { "s1/a/2": "fail" };

    const results = await runAllScenarios(
      [scenario("s1"), scenario("s2")],
      [A, B],
      RUN_ENV,
      "default",
      ctx(2),
    );

    expect([...results.keys()]).toStrictEqual(["s1", "s2"]);
    expect(
      results
        .get("s1")
        ?.get("openai/a")
        ?.get("default")
        ?.map((r) => r.result),
    ).toStrictEqual(["pass", "fail"]);
    expect(results.get("s2")?.get("openai/b")?.get("default")).toHaveLength(2);
  });

  it("prints a scenario's trial summary once its last trial is in", async () => {
    await runAllScenarios([scenario("s1")], [A], RUN_ENV, "default", ctx(2));

    expect(printTrialSummary).toHaveBeenCalledTimes(1);
    expect(vi.mocked(printTrialSummary).mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("prints no trial summary for a single trial", async () => {
    await runAllScenarios([scenario("s1")], [A], RUN_ENV, "default", ctx(1));

    expect(printTrialSummary).not.toHaveBeenCalled();
  });

  it("announces each round when repeating", async () => {
    await runAllScenarios([scenario("s1")], [A], RUN_ENV, "default", ctx(2));

    const logged = vi.mocked(console.log).mock.calls.join("\n");

    expect(logged).toContain("Round 1/2");
    expect(logged).toContain("Round 2/2");
  });

  it("does not announce rounds for a single trial", async () => {
    await runAllScenarios([scenario("s1")], [A], RUN_ENV, "default", ctx(1));

    expect(vi.mocked(console.log)).not.toHaveBeenCalled();
  });
});

describe("runAllScenarios skipped scenarios", () => {
  it("skips a scenario once, in round 1, whatever the repeat count", async () => {
    vi.mocked(shouldSkipScenario).mockImplementation((s) =>
      s.id === "s1" ? "needs a thing" : null,
    );

    const results = await runAllScenarios(
      [scenario("s1"), scenario("s2")],
      [A, B],
      RUN_ENV,
      "default",
      ctx(3),
    );

    expect(emitSkipped).toHaveBeenCalledTimes(2);
    expect(order().every((entry) => entry.startsWith("s2/"))).toBe(true);
    expect(results.get("s1")?.get("openai/a")?.get("default")).toHaveLength(1);
    expect(results.get("s2")?.get("openai/a")?.get("default")).toHaveLength(3);
  });

  it("leaves the clean Live Set alone across a skipped scenario", async () => {
    vi.mocked(shouldSkipScenario).mockImplementation((s) =>
      s.id === "skipped" ? "nope" : null,
    );

    await runAllScenarios(
      [
        scenario("r1", { reuseLiveSet: true }),
        scenario("skipped"),
        scenario("r2", { reuseLiveSet: true }),
      ],
      [A],
      RUN_ENV,
      "default",
      ctx(1),
    );

    expect(skipFlags()).toStrictEqual([false, true]);
  });
});

describe("runAllScenarios Live Set reuse", () => {
  it("hands a clean Set to the next reuse scenario on the same Set", async () => {
    await runAllScenarios(
      [
        scenario("r1", { reuseLiveSet: true }),
        scenario("r2", { reuseLiveSet: true }),
      ],
      [A],
      RUN_ENV,
      "default",
      ctx(1),
    );

    expect(skipFlags()).toStrictEqual([false, true]);
  });

  it("carries the hand-off from the last scenario into the next round", async () => {
    await runAllScenarios(
      [scenario("r1", { reuseLiveSet: true })],
      [A, B],
      RUN_ENV,
      "default",
      ctx(2),
    );

    expect(skipFlags()).toStrictEqual([false, true, true, true]);
  });

  it("reopens for a different Set, or after a scenario that does not reset", async () => {
    await runAllScenarios(
      [
        scenario("r1", { reuseLiveSet: true }),
        scenario("other", { reuseLiveSet: true, liveSet: "set-2" }),
        scenario("plain"),
        scenario("r2", { reuseLiveSet: true, liveSet: "set-2" }),
      ],
      [A],
      RUN_ENV,
      "default",
      ctx(1),
    );

    expect(skipFlags()).toStrictEqual([false, false, false, false]);
  });

  it("never reuses a Set the previous run did not leave clean", async () => {
    outcomes = { "r1/a/1": "error" };

    await runAllScenarios(
      [
        scenario("r1", { reuseLiveSet: true }),
        scenario("r2", { reuseLiveSet: true }),
      ],
      [A],
      RUN_ENV,
      "default",
      ctx(1),
    );

    expect(skipFlags()).toStrictEqual([false, false]);
  });
});

describe("runAllScenarios stalled models", () => {
  it("drops a model whose trials keep erroring, across rounds", async () => {
    const scenarios = [scenario("s1"), scenario("s2")];

    outcomes = {
      "s1/a/1": "error",
      "s2/a/1": "error",
      "s1/a/2": "error",
    };

    await runAllScenarios(scenarios, [A, B], RUN_ENV, "default", ctx(3));

    expect(MAX_CONSECUTIVE_ERRORED_TRIALS).toBe(3);
    expect(order().filter((entry) => entry.includes("/a/"))).toStrictEqual([
      "s1/a/1",
      "s2/a/1",
      "s1/a/2",
    ]);
    expect(order().filter((entry) => entry.includes("/b/"))).toHaveLength(6);
    expect(vi.mocked(console.warn).mock.calls.join("\n")).toContain("openai/a");
  });

  it("counts only trials in a row: a run that reaches the model resets it", async () => {
    outcomes = { "s1/a/1": "error", "s2/a/1": "error", "s2/a/2": "error" };

    await runAllScenarios(
      [scenario("s1"), scenario("s2")],
      [A],
      RUN_ENV,
      "default",
      ctx(2),
    );

    expect(order()).toHaveLength(4);
  });

  it("does not count a skipped scenario toward the streak", async () => {
    vi.mocked(shouldSkipScenario).mockImplementation((s) =>
      s.id === "skipped" ? "nope" : null,
    );
    outcomes = { "s1/a/1": "error", "s2/a/1": "error", "s3/a/1": "error" };

    await expect(
      runAllScenarios(
        [scenario("s1"), scenario("skipped"), scenario("s2"), scenario("s3")],
        [A],
        RUN_ENV,
        "default",
        ctx(1),
      ),
    ).rejects.toThrow(/3 trials in a row errored/);
    expect(order()).toStrictEqual(["s1/a/1", "s2/a/1", "s3/a/1"]);
  });

  it("stops the run when no model is left", async () => {
    outcomes = { "s1/a/1": "error", "s2/a/1": "error", "s1/a/2": "error" };

    await expect(
      runAllScenarios(
        [scenario("s1"), scenario("s2")],
        [A],
        RUN_ENV,
        "default",
        ctx(3),
      ),
    ).rejects.toThrow(/Stopping/);
  });
});
