// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type JsonEvalResult } from "../json-results/types.ts";
import { describeRunAbort, neverStartedRuns } from "./run-abort.ts";

function run(result: JsonEvalResult["result"], error?: string): JsonEvalResult {
  return { result, error } as JsonEvalResult;
}

function byModel(runs: JsonEvalResult[]) {
  return new Map([["codex-code/luna", new Map([["default", runs]])]]);
}

describe("neverStartedRuns", () => {
  it("returns every run when all of them errored", () => {
    const runs = [run("error", "x"), run("error", "y")];

    expect(neverStartedRuns(byModel(runs))).toStrictEqual(runs);
  });

  it("returns nothing when any run reached the model", () => {
    expect(
      neverStartedRuns(byModel([run("error"), run("fail")])),
    ).toStrictEqual([]);
  });

  it("returns nothing for a scenario with no runs", () => {
    expect(neverStartedRuns(byModel([]))).toStrictEqual([]);
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

    expect(message).toContain("3 scenarios in a row never started");
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
});
