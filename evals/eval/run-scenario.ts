/**
 * Scenario runner - executes evaluation scenarios against Ableton Live
 */

import {
  assertToolCalled,
  assertState,
  assertWithLlmJudge,
  assertResponseContains,
} from "./assertions/index.ts";
import {
  createEvalSession,
  getDefaultModel,
  type EvalSession,
} from "./eval-session.ts";
import { openLiveSet } from "./open-live-set.ts";
import type {
  EvalScenario,
  EvalScenarioResult,
  EvalTurnResult,
  EvalAssertion,
  EvalAssertionResult,
  EvalProvider,
} from "./types.ts";

export interface JudgeOverride {
  provider: EvalProvider;
  model?: string;
}

export interface RunScenarioOptions {
  provider: EvalProvider;
  model?: string;
  skipLiveSetOpen?: boolean;
  judgeOverride?: JudgeOverride;
}

/**
 * Run a single evaluation scenario
 *
 * @param scenario - The scenario to run
 * @param options - Run options including provider/model
 * @returns Scenario result with turns, assertions, and pass/fail status
 */
export async function runScenario(
  scenario: EvalScenario,
  options: RunScenarioOptions,
): Promise<EvalScenarioResult> {
  const { provider, model, skipLiveSetOpen, judgeOverride } = options;
  const startTime = Date.now();
  const turns: EvalTurnResult[] = [];
  let session: EvalSession | null = null;

  try {
    // 1. Open Live Set and wait for MCP
    if (!skipLiveSetOpen) {
      console.log(`\nOpening Live Set: ${scenario.liveSet}`);
      await openLiveSet(scenario.liveSet);
    }

    // 2. Create evaluation session
    const effectiveModel = model ?? getDefaultModel(provider);

    console.log(`\nStarting scenario: ${scenario.id}`);
    console.log(`Description: ${scenario.description}`);
    console.log(`Provider: ${provider}`);
    console.log(`Model: ${effectiveModel}`);

    session = await createEvalSession({
      provider,
      model,
      instructions: scenario.instructions,
    });

    // 3. Run each message turn
    for (const [i, message] of scenario.messages.entries()) {
      const turnStart = Date.now();
      const turnResult = await session.sendMessage(message, i + 1);

      turns.push({
        turnIndex: i,
        userMessage: message,
        assistantResponse: turnResult.text,
        toolCalls: turnResult.toolCalls,
        durationMs: Date.now() - turnStart,
      });
    }

    // 4. Run assertions
    console.log(`\nRunning ${scenario.assertions.length} assertion(s)...`);
    const assertionResults = await runAssertions(
      scenario.assertions,
      turns,
      session,
      provider,
      judgeOverride,
    );

    const passed = assertionResults.every((r) => r.passed);

    return {
      scenario,
      turns,
      assertions: assertionResults,
      passed,
      totalDurationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      scenario,
      turns,
      assertions: [],
      passed: false,
      totalDurationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (session) {
      await session.close();
    }
  }
}

/**
 * Run all assertions for a scenario
 *
 * @param assertions - Assertions to run
 * @param turns - Completed conversation turns
 * @param session - Active evaluation session
 * @param provider - LLM provider being used
 * @param judgeOverride - Optional judge LLM override
 * @returns Array of assertion results
 */
async function runAssertions(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  session: EvalSession,
  provider: EvalProvider,
  judgeOverride?: JudgeOverride,
): Promise<EvalAssertionResult[]> {
  const results: EvalAssertionResult[] = [];

  for (const assertion of assertions) {
    const result = await runAssertion(
      assertion,
      turns,
      session,
      provider,
      judgeOverride,
    );

    results.push(result);

    const status = result.passed ? "✓" : "✗";

    console.log(`  ${status} ${result.message}`);
  }

  return results;
}

/**
 * Run a single assertion
 *
 * @param assertion - The assertion to evaluate
 * @param turns - Completed conversation turns
 * @param session - Active evaluation session
 * @param provider - LLM provider being used
 * @param judgeOverride - Optional judge LLM override
 * @returns Assertion result
 */
async function runAssertion(
  assertion: EvalAssertion,
  turns: EvalTurnResult[],
  session: EvalSession,
  provider: EvalProvider,
  judgeOverride?: JudgeOverride,
): Promise<EvalAssertionResult> {
  switch (assertion.type) {
    case "tool_called":
      return assertToolCalled(assertion, turns);

    case "state":
      return await assertState(assertion, session.mcpClient);

    case "llm_judge":
      return await assertWithLlmJudge(
        assertion,
        turns,
        provider,
        judgeOverride,
      );

    case "response_contains":
      return assertResponseContains(assertion, turns);

    default:
      return {
        assertion,
        passed: false,
        message: `Unknown assertion type: ${(assertion as EvalAssertion).type}`,
      };
  }
}
