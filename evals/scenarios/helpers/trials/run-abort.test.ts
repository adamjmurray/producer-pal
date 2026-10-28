// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type JsonEvalResult } from "../json-results/types.ts";
import {
  describeRunAbort,
  MAX_CONSECUTIVE_SCENARIO_ERRORS,
  stalledModels,
} from "./run-abort.ts";

function run(result: JsonEvalResult["result"], error?: string): JsonEvalResult {
  return { result, error } as JsonEvalResult;
}

function scenario(byModel: Record<string, JsonEvalResult[]>) {
  return new Map(
    Object.entries(byModel).map(([model, runs]) => [
      model,
      new Map([["default", runs]]),
    ]),
  );
}

describe("stalledModels", () => {
  const errored = [run("error", "x"), run("error", "y")];

  it("drops only the model that errored on every trial, scenario after scenario", () => {
    const streaks = new Map<string, number>();
    const both = scenario({ terra: errored, sonnet: [run("pass")] });

    for (let i = 1; i < MAX_CONSECUTIVE_SCENARIO_ERRORS; i++) {
      expect(stalledModels(streaks, both).size).toBe(0);
    }

    expect([...stalledModels(streaks, both)]).toStrictEqual([
      ["terra", errored],
    ]);
  });

  it("resets a model's streak when any trial reaches the model", () => {
    const streaks = new Map([["terra", MAX_CONSECUTIVE_SCENARIO_ERRORS - 1]]);

    stalledModels(streaks, scenario({ terra: [run("error"), run("fail")] }));

    expect(streaks.get("terra")).toBe(0);
  });

  it("does not count a scenario with no runs", () => {
    const streaks = new Map<string, number>();

    stalledModels(streaks, scenario({ terra: [] }));

    expect(streaks.get("terra")).toBe(0);
  });
});

describe("describeRunAbort", () => {
  const capacity =
    "codex CLI exited 1. codex CLI error: Selected model is at capacity. Please try a different model.";

  it("blames the provider when every error is a refusal", () => {
    const message = describeRunAbort(3, [
      run("error", capacity),
      run("error", capacity),
    ]);

    expect(message).toContain("3 scenarios in a row errored");
    expect(message).toContain("Results so far are saved");
    expect(message).toContain("the model provider is refusing requests");
    expect(message).not.toContain("Live is not recovering");
    expect(message).toContain(`Last error: ${capacity}`);
  });

  it.each([
    "429 Too Many Requests",
    "Rate limit exceeded",
    "The model is overloaded",
    "quota exhausted",
    "HTTP 529",
  ])("treats %j as a provider refusal", (error) => {
    expect(describeRunAbort(3, [run("error", error)])).toContain(
      "the model provider is refusing requests",
    );
  });

  it("blames Live when the errors are not provider refusals", () => {
    const message = describeRunAbort(3, [
      run("error", "Live would not swap Sets"),
    ]);

    expect(message).toContain("Live is not recovering");
    expect(message).toContain("Last error: Live would not swap Sets");
  });

  it("blames Live when any error is not a refusal", () => {
    const message = describeRunAbort(3, [
      run("error", capacity),
      run("error", "connection refused"),
    ]);

    expect(message).toContain("Live is not recovering");
  });

  it.each([
    [["first", "second"], "second"],
    [["first", "second", "first", undefined], "first"],
  ])("quotes the last trial's error of %j", (errors, last) => {
    const message = describeRunAbort(
      3,
      errors.map((error) => run("error", error)),
    );

    expect(message).toMatch(new RegExp(`Last error: ${last}$`));
  });

  it("blames Live and omits the sample when there is no error text", () => {
    const message = describeRunAbort(3, [run("error")]);

    expect(message).toContain("Live is not recovering");
    expect(message).not.toContain("Last error");
  });

  it("names the dropped model instead of stopping the run", () => {
    const message = describeRunAbort(
      3,
      [run("error", "usage limit")],
      "codex-code/gpt-6.1-terra",
    );

    expect(message).toMatch(/^codex-code\/gpt-6.1-terra: 3 scenarios/);
    expect(message).toContain("Dropping codex-code/gpt-6.1-terra");
    expect(message).not.toContain("Results so far are saved");
  });
});
