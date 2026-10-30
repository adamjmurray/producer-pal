// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertWithJevFirst } from "./jev-first-judge.ts";
import { assertWithLlmJudge } from "../../assertions/llm-judge.ts";
import { type EvalSession } from "../../eval-session.ts";
import {
  type EvalAssertionResult,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";
import { runAllAssertions } from "../scenario-sections.ts";

vi.mock(import("../../assertions/llm-judge.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  assertWithLlmJudge: vi.fn(),
}));
vi.mock(import("./jev-first-judge.ts"), () => ({
  assertWithJevFirst: vi.fn(),
}));

const scenario = {
  id: "s",
  description: "d",
  tags: [],
  liveSet: "t",
  messages: ["m"],
  assertions: [{ type: "llm_judge", prompt: "Do it" }],
} as unknown as EvalScenario;
const turns = [] as EvalTurnResult[];
const session = {} as EvalSession;

const judgeResult = (
  message: string,
  details: unknown,
): EvalAssertionResult => ({
  assertion: scenario.assertions[0] as EvalAssertionResult["assertion"],
  earned: 0,
  maxScore: 0,
  message,
  details,
});

/**
 * Run the assertions with the judge flags under test.
 *
 * @param skipJudge - The --skip-judge flag
 * @param jev - The Jev settings, if --jev
 * @returns The assertion results
 */
function run(skipJudge: boolean, jev?: { route: "typesafe" }) {
  return runAllAssertions(
    scenario,
    turns,
    session,
    "google",
    undefined,
    skipJudge,
    true,
    jev,
  );
}

describe("runAllAssertions judge choice", () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.mocked(assertWithLlmJudge).mockReset();
    vi.mocked(assertWithJevFirst).mockReset();
  });

  const output = (): string => log.mock.calls.flat().join("\n");

  it("uses only the LLM judge without Jev", async () => {
    vi.mocked(assertWithLlmJudge).mockResolvedValue(
      judgeResult("LLM judge: pass", { pass: true, issues: [] }),
    );

    await run(false);

    expect(assertWithLlmJudge).toHaveBeenCalledTimes(1);
    expect(assertWithJevFirst).not.toHaveBeenCalled();
    expect(output()).not.toContain("Jev");
  });

  it("asks Jev first with --jev, leaving the LLM judge to the wrapper", async () => {
    vi.mocked(assertWithJevFirst).mockResolvedValue(
      judgeResult("Jev judge: pass", {
        pass: true,
        issues: [],
        decidedBy: "jev",
        jev: {
          route: "typesafe",
          verdict: "pass",
          minProbability: 0.95,
          outcome: { level: "complete success" },
        },
      }),
    );

    const results = await run(false, { route: "typesafe" });

    expect(assertWithLlmJudge).not.toHaveBeenCalled();
    expect(assertWithJevFirst).toHaveBeenCalledWith(
      scenario.assertions[0],
      turns,
      "google",
      undefined,
      [],
      { route: "typesafe" },
    );
    expect(results).toHaveLength(1);
    expect(output()).toContain(
      "Jev decided: pass (outcome: complete success, lowest answer 0.95)",
    );
  });

  it("lets --skip-judge win over --jev", async () => {
    const results = await run(true, { route: "typesafe" });

    expect(results).toStrictEqual([]);
    expect(assertWithJevFirst).not.toHaveBeenCalled();
    expect(assertWithLlmJudge).not.toHaveBeenCalled();
  });

  it("prints the issues of a fail", async () => {
    vi.mocked(assertWithJevFirst).mockResolvedValue(
      judgeResult("Jev judge: fail (1 unmet)", {
        pass: false,
        issues: ["Jev: not met"],
      }),
    );

    await run(false, { route: "typesafe" });

    expect(output()).toContain("Jev: not met");
    expect(output()).toContain("fail — 1 issue(s)");
  });

  it("prints a result with no details as a fail", async () => {
    vi.mocked(assertWithLlmJudge).mockResolvedValue(
      judgeResult("LLM judge error", undefined),
    );

    await run(false);

    expect(output()).toContain("fail");
  });
});
