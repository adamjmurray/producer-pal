// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * JSON-serializable types for persisted eval results
 */

export const RESULTS_DIR = "evals/results";

/** JSON-serializable result of a single eval scenario run */
export interface JsonEvalResult {
  /** Schema version for forward compatibility */
  version: 1;
  /** Unique run identifier (ISO timestamp with dashes, e.g. "2026-03-22T10-30-00Z") */
  runId: string;
  /** When this run was executed (ISO 8601) */
  timestamp: string;
  /** Scenario identifier */
  scenarioId: string;
  /** Scenario description */
  scenarioDescription: string;
  /** Whether this is a regression or capability eval */
  kind?: "regression" | "capability";
  /** Model used: "provider/model" */
  model: string;
  /** Config profile ID */
  configProfileId: string;
  /** System instructions used (undefined = none) */
  instructions?: string;
  /** Trial number (1-indexed, present when using -r flag) */
  trial?: number;
  /** Total number of trials (present when using -r flag) */
  totalTrials?: number;
  /** Overall pass/fail (checks + judge; efficiency is informational) */
  result: "pass" | "fail";
  /** Conversation turns */
  turns: JsonTurnRecord[];
  /** Deterministic check results */
  checks: JsonChecks;
  /** Token usage efficiency (present when token_usage assertion exists) */
  efficiency?: JsonEfficiency;
  /** LLM judge review (present when llm_judge assertion exists) */
  judge?: JsonJudge;
  /** Total wall-clock duration in ms */
  totalDurationMs: number;
  /** Aggregate token usage */
  totalUsage?: JsonTokenUsage;
  /** Error message if scenario failed */
  error?: string;
}

/** Aggregated deterministic check results */
export interface JsonChecks {
  /** Whether all checks passed */
  pass: boolean;
  /** Individual check results */
  results: JsonCheckResult[];
}

/** Token usage efficiency relative to target */
export interface JsonEfficiency {
  /** Actual input tokens used */
  inputTokens: number;
  /** Target token budget */
  targetTokens: number;
  /** inputTokens / targetTokens as percentage */
  percentage: number;
}

/** LLM judge verdict */
export interface JsonJudge {
  /** Judge pass/fail verdict */
  pass: boolean;
  /** Issues flagged by the judge (empty when passing) */
  issues: string[];
}

export interface JsonTurnRecord {
  turnIndex: number;
  userMessage: string;
  assistantResponse: string;
  toolCalls: JsonToolCall[];
  durationMs: number;
  usage?: JsonTokenUsage;
}

export interface JsonToolCall {
  name: string;
  args: Record<string, unknown>;
  /** Tool result text */
  result?: string;
}

export interface JsonTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

/** Individual deterministic check result */
export interface JsonCheckResult {
  /** Assertion type identifier */
  type: string;
  /** Human-readable label */
  label: string;
  pass: boolean;
  message: string;
  details?: Record<string, unknown>;
  /** Model's self-reflection on why it failed (only on actionable failures) */
  reflection?: string;
}
