// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for converter.ts
 */

import { describe, it, expect } from "vitest";
import {
  type EvalAssertionResult,
  type EvalScenarioResult,
  type EvalTurnResult,
} from "../../types.ts";
import { toJsonResult } from "./converter.ts";

const PASSING_JUDGE = { pass: true, issues: [] };
const FAILING_JUDGE = {
  pass: false,
  issues: ["Missing confirmation", "Wrong tool used"],
};

function makeTurn(overrides?: Partial<EvalTurnResult>): EvalTurnResult {
  return {
    turnIndex: 0,
    userMessage: "Connect to Ableton",
    assistantResponse: "Connected!",
    toolCalls: [
      { name: "ppal-connect", args: {}, result: '{"connected":true}' },
    ],
    durationMs: 1000,
    stepUsages: [{ inputTokens: 5000, outputTokens: 2000 }],
    ...overrides,
  };
}

function makeAssertion(
  overrides?: Partial<EvalAssertionResult>,
): EvalAssertionResult {
  return {
    assertion: { type: "tool_called", tool: "ppal-connect" },
    earned: 1,
    maxScore: 1,
    message: "tool_called: ppal-connect",
    ...overrides,
  };
}

function makeResult(
  overrides?: Partial<EvalScenarioResult>,
): EvalScenarioResult {
  return {
    scenario: {
      id: "test-scenario",
      description: "A test scenario",
      liveSet: "test",
      messages: ["Connect to Ableton"],
      assertions: [],
    },
    turns: [makeTurn()],
    assertions: [makeAssertion()],
    totalDurationMs: 1500,
    totalUsage: { inputTokens: 5000, outputTokens: 2000 },
    ...overrides,
  };
}

/**
 * Convert a scenario result using the standard run metadata.
 *
 * @param overrides - Scenario result fields to override
 * @returns The converted JSON result
 */
function convert(overrides?: Partial<EvalScenarioResult>) {
  return toJsonResult(
    makeResult(overrides),
    "run-1",
    "google/gemini",
    "default",
  );
}

/**
 * Build an llm_judge assertion result.
 *
 * @param details - The judge verdict recorded on the assertion
 * @param message - The assertion message
 * @returns An llm_judge assertion result
 */
function judgeAssertion(
  details: { pass: boolean; issues: string[] },
  message: string,
): EvalAssertionResult {
  return makeAssertion({
    assertion: { type: "llm_judge", prompt: "Evaluate" },
    earned: 0,
    maxScore: 0,
    message,
    details,
  });
}

describe("toJsonResult", () => {
  it("converts a basic passing result", () => {
    const result = toJsonResult(
      makeResult(),
      "2026-03-22T10-30-00Z",
      "google/gemini",
      "default",
    );

    expect(result.version).toBe(1);
    expect(result.runId).toBe("2026-03-22T10-30-00Z");
    expect(result.scenarioId).toBe("test-scenario");
    expect(result.scenarioDescription).toBe("A test scenario");
    expect(result.model).toBe("google/gemini");
    expect(result.configProfileId).toBe("default");
    expect(result.result).toBe("pass");
    expect(result.checks).toStrictEqual({
      pass: true,
      results: [expect.objectContaining({ type: "tool_called", pass: true })],
    });
    expect(result.judge).toBeUndefined();
  });

  it("includes turns with aggregated step usage", () => {
    const result = convert({
      turns: [
        makeTurn({
          stepUsages: [
            { inputTokens: 3000, outputTokens: 1000 },
            { inputTokens: 2000, outputTokens: 1000 },
          ],
        }),
      ],
    });

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]?.usage).toStrictEqual({
      inputTokens: 5000,
      outputTokens: 2000,
    });
  });

  it("excludes judge and token_usage from checks", () => {
    const result = convert({
      assertions: [
        makeAssertion(),
        judgeAssertion(PASSING_JUDGE, "LLM judge: pass"),
      ],
    });

    expect(result.checks.results).toHaveLength(1);
    expect(result.checks.results[0]?.type).toBe("tool_called");
  });

  it("derives judge from llm_judge assertion (passing)", () => {
    const result = convert({
      assertions: [judgeAssertion(PASSING_JUDGE, "LLM judge: pass")],
    });

    expect(result.judge).toBeDefined();
    expect(result.judge?.pass).toBe(true);
    expect(result.judge?.issues).toStrictEqual([]);
    // #54: a judge-only scenario (no deterministic checks) must let a passing
    // judge gate the verdict. Before the fix, checks.pass was false whenever
    // there were zero checks, so the overall result hard-failed even though the
    // judge passed — a judge-only scenario could never report pass.
    expect(result.result).toBe("pass");
  });

  it("derives judge from llm_judge assertion (failing)", () => {
    const result = convert({
      assertions: [
        judgeAssertion(FAILING_JUDGE, "LLM judge: fail (2 issue(s))"),
      ],
    });

    expect(result.judge?.pass).toBe(false);
    expect(result.judge?.issues).toHaveLength(2);
    expect(result.judge?.issues[0]).toBe("Missing confirmation");
    expect(result.result).toBe("fail");
  });

  it("does not let an advisory judge gate the overall result", () => {
    const result = convert({
      scenario: {
        id: "advisory-scenario",
        description: "Judge is advisory",
        liveSet: "test",
        messages: ["Connect to Ableton"],
        assertions: [],
        judgeAdvisory: true,
      },
      assertions: [
        makeAssertion(), // passing deterministic check
        judgeAssertion(FAILING_JUDGE, "LLM judge: fail (2 issue(s))"),
      ],
    });

    // The judge still records its verdict + issues...
    expect(result.judge?.pass).toBe(false);
    expect(result.judge?.advisory).toBe(true);
    expect(result.judge?.issues).toHaveLength(2);
    // ...but an advisory fail must NOT flip the overall result.
    expect(result.result).toBe("pass");
  });

  it("marks result as fail when a check fails", () => {
    const result = convert({
      assertions: [makeAssertion({ earned: 0, maxScore: 1 })],
    });

    expect(result.result).toBe("fail");
    expect(result.checks.pass).toBe(false);
    expect(result.checks.results[0]?.pass).toBe(false);
  });

  it("passes with no judge and all checks passing", () => {
    const result = convert();

    expect(result.result).toBe("pass");
    expect(result.judge).toBeUndefined();
  });

  it("includes error field when present", () => {
    const result = convert({ error: "Connection failed" });

    expect(result.error).toBe("Connection failed");
  });

  it("handles zero checks gracefully", () => {
    const result = convert({ assertions: [] });

    expect(result.checks).toStrictEqual({ pass: false, results: [] });
    expect(result.result).toBe("fail");
  });

  it("preserves full tool results in turns", () => {
    const longResult = "x".repeat(600);
    const result = convert({
      turns: [
        makeTurn({
          toolCalls: [{ name: "ppal-connect", args: {}, result: longResult }],
        }),
      ],
    });

    expect(result.turns[0]?.toolCalls[0]?.result).toBe(longResult);
  });

  it("strips tool results from check details matchingCalls", () => {
    const result = convert({
      assertions: [
        makeAssertion({
          details: {
            matchingCalls: [
              { name: "ppal-connect", args: {}, result: "big response" },
            ],
            count: 1,
            expectedCount: { min: 1 },
          },
        }),
      ],
    });

    const details = result.checks.results[0]?.details as Record<
      string,
      unknown
    >;
    const calls = details.matchingCalls as { result?: string }[];

    expect(calls[0]).toStrictEqual({ name: "ppal-connect", args: {} });
    expect(calls[0]).not.toHaveProperty("result");
  });

  it("includes reasoning tokens when present", () => {
    const result = convert({
      turns: [
        makeTurn({
          stepUsages: [
            { inputTokens: 3000, outputTokens: 1000, reasoningTokens: 500 },
          ],
        }),
      ],
    });

    expect(result.turns[0]?.usage?.reasoningTokens).toBe(500);
  });

  it("omits reasoning tokens when zero", () => {
    const result = convert();

    expect(result.turns[0]?.usage).not.toHaveProperty("reasoningTokens");
  });

  it("includes reflection on failing check when present", () => {
    const result = convert({
      assertions: [
        makeAssertion({
          earned: 0,
          maxScore: 1,
          details: {
            count: 0,
            expectedCount: { min: 1 },
            reflection: "I chose not to call the tool because...",
          },
        }),
      ],
    });

    expect(result.checks.results[0]?.reflection).toBe(
      "I chose not to call the tool because...",
    );
  });

  it("omits reflection when not present on details", () => {
    const result = convert({
      assertions: [
        makeAssertion({
          earned: 0,
          maxScore: 1,
          details: { count: 0, expectedCount: { min: 1 } },
        }),
      ],
    });

    expect(result.checks.results[0]?.reflection).toBeUndefined();
  });

  it("builds efficiency from token_usage assertion", () => {
    const result = convert({
      assertions: [
        makeAssertion(),
        makeAssertion({
          assertion: {
            type: "token_usage",
            metric: "inputTokens",
            maxTokens: 20_000,
          },
          earned: 0,
          maxScore: 0,
          message: "inputTokens 15.5k / 20k target (77%)",
          details: { total: 15500, target: 20000, percentage: 77 },
        }),
      ],
    });

    expect(result.efficiency).toStrictEqual({
      inputTokens: 15500,
      targetTokens: 20000,
      percentage: 77,
    });
  });

  describe("signals", () => {
    it("keeps response_contains out of the gating checks", () => {
      const json = convert({
        assertions: [
          makeAssertion(),
          makeAssertion({
            assertion: { type: "response_contains", pattern: /boosted/i },
            earned: 0,
            message: "Expected response to contain /boosted/i",
          }),
        ],
      });

      expect(json.checks.results).toHaveLength(1);
      expect(json.checks.pass).toBe(true);
      expect(json.signals).toHaveLength(1);
      expect(json.signals?.[0]?.pass).toBe(false);
      expect(json.result).toBe("pass");
    });

    it("omits signals when the scenario has none", () => {
      expect(convert().signals).toBeUndefined();
    });
  });

  describe("toolErrors", () => {
    it("counts the calls that came back as errors", () => {
      const json = convert({
        turns: [
          makeTurn({
            toolCalls: [
              {
                name: "ppal-create-clip",
                args: {},
                result: "Error executing tool 'ppal-create-clip': bad notes",
              },
              { name: "ppal-create-clip", args: {}, result: '{"id":"1"}' },
            ],
          }),
        ],
      });

      expect(json.toolErrors).toStrictEqual({
        count: 1,
        total: 2,
        errors: [
          {
            turnIndex: 0,
            name: "ppal-create-clip",
            message: "Error executing tool 'ppal-create-clip': bad notes",
          },
        ],
      });
      // A recovered error never gates.
      expect(json.result).toBe("pass");
    });

    it("omits toolErrors when the run made no tool calls", () => {
      expect(
        convert({ turns: [makeTurn({ toolCalls: [] })] }).toolErrors,
      ).toBeUndefined();
    });
  });
});
