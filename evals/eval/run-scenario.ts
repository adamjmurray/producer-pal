/**
 * Scenario runner - executes evaluation scenarios against Ableton Live
 */

import {
  formatScenarioHeader,
  formatSectionHeader,
  formatSubsectionHeader,
} from "#evals/chat/shared/formatting.ts";
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
import { computeCorrectnessBreakdown } from "./helpers/correctness-score.ts";
import { isQuietMode } from "./helpers/output-config.ts";
import { openLiveSet } from "./open-live-set.ts";
import type {
  EvalScenario,
  EvalScenarioResult,
  EvalTurnResult,
  EvalAssertion,
  EvalAssertionResult,
  EvalProvider,
} from "./types.ts";

const LIVE_SETS_DIR = "evals/live-sets";

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
      const liveSetPath = resolveLiveSetPath(scenario.liveSet);

      if (!isQuietMode()) console.log(`\nOpening Live Set: ${liveSetPath}`);
      await openLiveSet(liveSetPath);
    }

    // 2. Create evaluation session
    const effectiveModel = model ?? getDefaultModel(provider);

    console.log(
      formatScenarioHeader(
        scenario.id,
        scenario.description,
        provider,
        effectiveModel,
      ),
    );

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

    // 4. Run assertions - split into correctness checks and LLM judge
    const correctnessAssertions = scenario.assertions.filter(
      (a) => a.type !== "llm_judge",
    );
    const judgeAssertions = scenario.assertions.filter(
      (a) => a.type === "llm_judge",
    );

    console.log(formatSectionHeader("EVALUATION"));
    console.log(formatSubsectionHeader("Correctness Checks"));
    console.log(`\nRunning ${correctnessAssertions.length} check(s)...`);

    // Run correctness checks first
    const correctnessResults = await runAssertions(
      correctnessAssertions,
      turns,
      session,
      provider,
      judgeOverride,
    );

    // Print correctness summary
    const { earned, max, score } =
      computeCorrectnessBreakdown(correctnessResults);

    if (max > 0) {
      console.log(
        `\nCorrectness: ${earned}/${max} points (${score.toFixed(2)}/5)`,
      );
    }

    // Run LLM judge assertions (without printing pass/fail)
    const judgeResults = await runJudgeAssertions(
      judgeAssertions,
      turns,
      provider,
      judgeOverride,
    );

    const assertionResults = [...correctnessResults, ...judgeResults];
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
 * Run correctness assertions (non-LLM judge)
 *
 * @param assertions - Assertions to run
 * @param turns - Completed conversation turns
 * @param session - Active evaluation session
 * @param _provider - LLM provider (unused, kept for signature compatibility)
 * @param _judgeOverride - Judge override (unused, kept for signature compatibility)
 * @returns Array of assertion results
 */
async function runAssertions(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  session: EvalSession,
  _provider: EvalProvider,
  _judgeOverride?: JudgeOverride,
): Promise<EvalAssertionResult[]> {
  const results: EvalAssertionResult[] = [];

  for (const assertion of assertions) {
    const result = await runCorrectnessAssertion(assertion, turns, session);

    results.push(result);

    // Show results in verbose mode
    if (!isQuietMode()) {
      const status = result.passed ? "✓" : "✗";

      console.log(`  ${status} ${result.message}`);
    }
  }

  return results;
}

/**
 * Run LLM judge assertions (without printing pass/fail status)
 *
 * @param assertions - Judge assertions to run
 * @param turns - Completed conversation turns
 * @param provider - LLM provider being used
 * @param judgeOverride - Optional judge LLM override
 * @returns Array of assertion results
 */
async function runJudgeAssertions(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  provider: EvalProvider,
  judgeOverride?: JudgeOverride,
): Promise<EvalAssertionResult[]> {
  const results: EvalAssertionResult[] = [];

  for (const assertion of assertions) {
    if (assertion.type === "llm_judge") {
      const result = await assertWithLlmJudge(
        assertion,
        turns,
        provider,
        judgeOverride,
      );

      results.push(result);
    }
  }

  return results;
}

/**
 * Run a single correctness assertion (non-LLM judge)
 *
 * @param assertion - The assertion to evaluate
 * @param turns - Completed conversation turns
 * @param session - Active evaluation session
 * @returns Assertion result
 */
async function runCorrectnessAssertion(
  assertion: EvalAssertion,
  turns: EvalTurnResult[],
  session: EvalSession,
): Promise<EvalAssertionResult> {
  switch (assertion.type) {
    case "tool_called":
      return assertToolCalled(assertion, turns);

    case "state":
      return await assertState(assertion, session.mcpClient);

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

/**
 * Resolve a liveSet value to a full path.
 * If it's a short name (no `/`), resolves to the Ableton project structure.
 * @param liveSet - Short name or full path
 * @returns Full path to the .als file
 */
function resolveLiveSetPath(liveSet: string): string {
  if (liveSet.includes("/")) {
    return liveSet;
  }

  // Ableton stores .als files in "{name} Project/{name}.als"
  return `${LIVE_SETS_DIR}/${liveSet} Project/${liveSet}.als`;
}
