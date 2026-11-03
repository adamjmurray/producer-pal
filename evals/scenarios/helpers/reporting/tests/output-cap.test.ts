// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { stripVTControlCharacters } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMultiTrialParts } from "../../trials/multi-trial-runs.ts";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import {
  type JsonEvalResult,
  type JsonTurnRecord,
} from "../../json-results/types.ts";
import { outputCapCount, outputCapTurns } from "../output-cap.ts";
import { type ResultsByScenario } from "../report-table.ts";
import { printResult, printResultBlock } from "../result-printer.ts";
import { printSummary } from "../summary-printer.ts";

vi.mock(import("../report-table.ts"), () => ({ printResultsTable: vi.fn() }));

const turn = (turnIndex: number, finishReason?: string): JsonTurnRecord => ({
  turnIndex,
  userMessage: "u",
  assistantResponse: "a",
  toolCalls: [],
  durationMs: 1,
  ...(finishReason != null && { finishReason }),
});

const result = (...turns: JsonTurnRecord[]): JsonEvalResult => ({
  version: 1,
  runId: "r",
  timestamp: "2026-10-30T00:00:00Z",
  scenarioId: "s",
  scenarioDescription: "d",
  model: "local/m",
  configProfileId: "default",
  result: "fail",
  turns,
  checks: { pass: false, results: [] },
  totalDurationMs: 1,
});

describe("outputCapTurns", () => {
  it("lists turns that ended on the cap, by either wording", () => {
    const r = result(
      turn(1, "stop"),
      turn(2, "length"),
      turn(3),
      turn(4, "max_tokens"),
    );

    expect(outputCapTurns(r)).toStrictEqual([2, 4]);
  });

  it("is empty for a run with no capped turn", () => {
    expect(outputCapTurns(result(turn(1, "stop"), turn(2)))).toStrictEqual([]);
  });

  it("counts capped turns across trials", () => {
    const trials = [
      result(turn(1, "length")),
      result(turn(1), turn(2, "length")),
    ];

    expect(outputCapCount(trials)).toBe(2);
  });
});

describe("output cap in run output", () => {
  let log: ReturnType<typeof vi.spyOn>;
  // CI forces color, so match the text without its color codes
  const output = (): string =>
    stripVTControlCharacters(log.mock.calls.flat().join("\n"));
  const byScenario = (results: JsonEvalResult[]): ResultsByScenario =>
    new Map([["s", new Map([["local/m", new Map([["default", results]])]])]]);
  const specs: ModelSpec[] = [{ provider: "local", model: "m" }];

  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("flags the capped turns in the saved result", () => {
    printResult(result(turn(1, "stop"), turn(2, "length")));

    expect(output()).toContain("Output cap (1)");
    expect(output()).toContain("turn 2 hit the output cap");
  });

  it("flags them in the RESULT block", () => {
    printResultBlock(result(turn(1, "length")));

    expect(output()).toContain("Output cap: 1 turn(s) hit it");
  });

  it("prints nothing for a run that stayed under the cap", () => {
    printResult(result(turn(1, "stop")));

    expect(output()).not.toContain("Output cap");
  });

  it("counts them in the summary", () => {
    printSummary(
      byScenario([result(turn(1, "length")), result(turn(1, "length"))]),
      specs,
      "default",
    );

    expect(output()).toContain("output cap");
    expect(output()).toContain("2 turn(s) hit the output cap");
  });

  it("totals them across repeated trials", () => {
    const parts = buildMultiTrialParts([
      result(turn(1, "length")),
      result(turn(1, "length"), turn(2, "length")),
    ]);

    expect(parts).toContainEqual({
      label: "output cap",
      value: "3",
      color: "yellow",
    });
  });

  it("stays out of the summary when nothing hit it", () => {
    printSummary(byScenario([result(turn(1, "stop"))]), specs, "default");

    expect(output()).not.toContain("output cap");
  });
});
