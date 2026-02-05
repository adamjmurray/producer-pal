// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Type definitions for the Producer Pal evaluation system
 */

import type { ConfigOptions } from "#evals/shared/config.ts";

// Re-export types from chat for convenience
export type { TurnResult, ToolCall } from "#evals/chat/shared/types.ts";

// Re-export ConfigOptions for convenience
export type { ConfigOptions };

export type EvalProvider = "anthropic" | "google" | "openai" | "openrouter";

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
}

/** Per-dimension minimum score thresholds */
export interface DimensionMinScores {
  accuracy?: number;
  reasoning?: number;
  efficiency?: number;
  naturalness?: number;
}

/**
 * Use LLM to judge response quality on 4 dimensions:
 * - Accuracy: Did it do exactly what was requested?
 * - Reasoning: Was its logic sound and did it pick the right tools?
 * - Efficiency: Did it use minimal steps?
 * - Naturalness: Did the interaction feel human-like?
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
  /** Minimum overall score (1-5) to pass (default: 3) */
  minScore?: number;
  /** Per-dimension minimum scores (optional, all must pass if specified) */
  minScores?: DimensionMinScores;
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
  passed: boolean;
  message: string;
  details?: unknown;
}

/**
 * Result of running a complete scenario
 */
export interface EvalScenarioResult {
  scenario: EvalScenario;
  turns: EvalTurnResult[];
  assertions: EvalAssertionResult[];
  passed: boolean;
  totalDurationMs: number;
  error?: string;
}
