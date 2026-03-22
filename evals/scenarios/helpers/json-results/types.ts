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
  /** Model used: "provider/model" */
  model: string;
  /** Config profile ID */
  configProfileId: string;
  /** Overall pass/fail */
  result: "pass" | "fail";
  /** Score summary */
  score: JsonScoreSummary;
  /** LLM judge review (present when llm_judge assertion exists) */
  review?: JsonReview;
  /** Conversation turns */
  turns: JsonTurnRecord[];
  /** Deterministic check results */
  checks: JsonCheckResult[];
  /** Total wall-clock duration in ms */
  totalDurationMs: number;
  /** Aggregate token usage */
  totalUsage?: JsonTokenUsage;
  /** Error message if scenario failed */
  error?: string;
}

export interface JsonScoreSummary {
  earned: number;
  max: number;
  percentage: number;
}

export interface JsonReview {
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
  /** Tool result truncated to ~500 chars */
  result?: string;
}

export interface JsonTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

/** Deterministic check result (non-judge assertions) */
export interface JsonCheckResult {
  /** Assertion type identifier */
  type: string;
  /** Human-readable label */
  label: string;
  pass: boolean;
  /** Phase 1: points earned */
  earned: number;
  /** Phase 1: max possible points */
  maxScore: number;
  message: string;
  details?: Record<string, unknown>;
  /** Model's self-reflection on why it failed (only on actionable failures) */
  reflection?: string;
}
