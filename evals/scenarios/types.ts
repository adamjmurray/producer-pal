// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type definitions for the Producer Pal evaluation system
 */

import { type ConfigOptions } from "#evals/shared/config.ts";

// Re-export types from chat for convenience
export type { TurnResult, ToolCall } from "#evals/chat/shared/types.ts";

// Re-export ConfigOptions for convenience
export type { ConfigOptions };

export type EvalProvider =
  | "anthropic"
  | "google"
  | "local"
  | "openai"
  | "openrouter";

/**
 * Config values that are orthogonal to scenarios and vary as a matrix dimension.
 * Scenario-bound config (memory, sampleFolder) is not included here.
 */
export interface MatrixConfigValues {
  smallModelMode?: boolean;
  jsonOutput?: boolean;
  tools?: string[];
}

/**
 * A named config profile for the eval matrix
 */
export interface ConfigProfile {
  /** Unique profile identifier (kebab-case) */
  id: string;
  /** Human-readable description */
  description: string;
  /** Config values to apply */
  config: MatrixConfigValues;
}

/**
 * A test scenario that runs against Ableton Live
 */
export interface EvalScenario {
  /** Unique scenario identifier */
  id: string;

  /** Human-readable description */
  description: string;

  /** Live Set name or path. Short names (no `/`) resolve to
   * `evals/live-sets/{name} Project/{name}.als` */
  liveSet: string;

  /** Conversation messages (multi-turn support) */
  messages: string[];

  /** Assertions to run after conversation completes */
  assertions: EvalAssertion[];

  /** Optional system instructions */
  instructions?: string;

  /** Optional config to apply before running scenario */
  config?: ConfigOptions;
}

/**
 * Union of all assertion types
 */
export type EvalAssertion =
  | ToolCallAssertion
  | StateAssertion
  | LlmJudgeAssertion
  | ResponseContainsAssertion;

/**
 * Assert that a specific tool was called with expected args
 */
export interface ToolCallAssertion {
  type: "tool_called";
  /** Tool name to check for */
  tool: string;
  /** Exact match on arguments. Use expect.objectContaining() for partial matches. */
  args?: Record<string, unknown>;
  /** Which turn to check (0-indexed, or "any" for any turn) */
  turn?: number | "any";
  /** How many times tool should be called */
  count?: number | { min?: number; max?: number };
  /** Max points this assertion is worth (default: 1) */
  score?: number;
}

/**
 * Assert Live Set state via MCP tool call
 */
export interface StateAssertion {
  type: "state";
  /** Tool to call to verify state */
  tool: string;
  /** Arguments for the tool */
  args: Record<string, unknown>;
  /** Expected partial result or matcher function */
  expect: Record<string, unknown> | ((result: unknown) => boolean);
  /** Max points this assertion is worth (default: 1) */
  score?: number;
}

/**
 * Use LLM to judge response quality on 4 dimensions (0.0-1.0 each):
 * - Accuracy: Did it do exactly what was requested?
 * - Reasoning: Was its logic sound and did it pick the right tools?
 * - Efficiency: Did it use minimal steps?
 * - Naturalness: Did the interaction feel human-like?
 *
 * Earned points = average of 4 dimensions × score
 */
export interface LlmJudgeAssertion {
  type: "llm_judge";
  /** Prompt describing what to evaluate */
  prompt: string;
  /** Which turn's response to judge (default: last) */
  turn?: number | "last";
  /** Provider for judge (default: same as scenario) */
  judgeProvider?: EvalProvider;
  /** Model for judge */
  judgeModel?: string;
  /** Max points this assertion is worth (default: 1) */
  score?: number;
}

/**
 * Simple text/regex matching on response
 */
export interface ResponseContainsAssertion {
  type: "response_contains";
  /** Text or regex pattern to match */
  pattern: string | RegExp;
  /** Which turn (default: any) */
  turn?: number | "any";
  /** Should NOT contain (default: false) */
  negate?: boolean;
  /** Max points this assertion is worth (default: 1) */
  score?: number;
}

/**
 * Result of a single conversation turn
 */
export interface EvalTurnResult {
  turnIndex: number;
  userMessage: string;
  assistantResponse: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: string;
  }>;
  durationMs: number;
}

/**
 * Result of evaluating a single assertion
 */
export interface EvalAssertionResult {
  assertion: EvalAssertion;
  /** Points earned (0 for failed deterministic, overall × score for LLM judge) */
  earned: number;
  /** Max possible points for this assertion */
  maxScore: number;
  message: string;
  details?: unknown;
}

/**
 * Result of running a complete scenario
 */
export interface EvalScenarioResult {
  scenario: EvalScenario;
  /** Config profile used for this run (undefined means default) */
  configProfileId?: string;
  turns: EvalTurnResult[];
  assertions: EvalAssertionResult[];
  /** Total points earned across all assertions */
  earnedScore: number;
  /** Total max possible points across all assertions */
  maxScore: number;
  totalDurationMs: number;
  error?: string;
}
