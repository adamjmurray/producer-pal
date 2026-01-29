/**
 * Producer Pal Evaluation System
 *
 * Run automated test scenarios against Ableton Live to evaluate
 * LLM tool usage and response quality.
 *
 * NOTE: This barrel file exists to provide a clean public API for the eval
 * library. While the project generally discourages barrel files, this module
 * is a self-contained library that benefits from centralized exports.
 */

export { runScenario } from "./run-scenario.ts";
export { loadScenarios, listScenarioIds } from "./load-scenarios.ts";
export { createEvalSession, type EvalSession } from "./eval-session.ts";
export { openLiveSet } from "./open-live-set.ts";

export type {
  EvalScenario,
  EvalAssertion,
  ToolCallAssertion,
  StateAssertion,
  LlmJudgeAssertion,
  ResponseContainsAssertion,
  EvalTurnResult,
  EvalAssertionResult,
  EvalScenarioResult,
  EvalProvider,
} from "./types.ts";
