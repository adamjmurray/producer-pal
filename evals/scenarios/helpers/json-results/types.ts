// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * JSON-serializable types for persisted eval results
 */

export const RESULTS_DIR = "evals/results";

/** JSON-serializable result of a single eval scenario run */
export interface JsonEvalResult {
  /** Schema version for forward compatibility. 2 adds the Jev-first judge
   *  fields (`JsonJudge.decidedBy`, `jev`, `llm`); runs without `--jev` still
   *  write 1. */
  version: 1 | 2;
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
  /** Run-environment label (e.g. "default", "small-model"). See `envLabel`. */
  configProfileId: string;
  /** Thinking level the model ran at (`--thinking`). Absent when none was set:
   *  the provider's own default. Runs at different levels share a
   *  `configProfileId`, so this is what tells them apart. */
  thinking?: string;
  /** System instructions used (undefined = none) */
  instructions?: string;
  /** Trial number (1-indexed, present when using -r flag) */
  trial?: number;
  /** Total number of trials (present when using -r flag) */
  totalTrials?: number;
  /** Overall result. `skipped` means the scenario's `requires` weren't
   *  satisfied by the active run environment, so it never ran. `error` means it
   *  tested nothing about the model — the Live Set would not open, the config
   *  would not apply, or the provider refused the request. Both are kept out of
   *  pass/fail counts and score averages: scoring them as failures reads as a
   *  clean 0/3 on scenarios nothing was ever asked of. */
  result: "pass" | "fail" | "skipped" | "error";
  /** Why the scenario was skipped (present only when `result` is `skipped`) */
  skipReason?: string;
  /** Conversation turns */
  turns: JsonTurnRecord[];
  /** Gating deterministic check results */
  checks: JsonChecks;
  /** Non-gating checks: run and reported, but excluded from pass/fail and from
   *  the score. Prose `response_contains` patterns live here — they grade the
   *  words a model chose, not what it did. */
  signals?: JsonCheckResult[];
  /** Failed tool calls (present when the run made any tool call). Never gates —
   *  it discounts the score instead. */
  toolErrors?: JsonToolErrors;
  /** Token usage efficiency (present when token_usage assertion exists) */
  efficiency?: JsonEfficiency;
  /** LLM judge review (present when llm_judge assertion exists) */
  judge?: JsonJudge;
  /** Total wall-clock duration in ms */
  totalDurationMs: number;
  /** Aggregate token usage */
  totalUsage?: JsonTokenUsage;
  /** Generation speed across every model call in the run */
  totalTiming?: JsonStepTiming;
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

/** Failed tool calls in a run, and how many calls there were in total. */
export interface JsonToolErrors {
  /** How many tool calls came back as an error */
  count: number;
  /** How many tool calls were made */
  total: number;
  /** One entry per failed call, with the error text truncated */
  errors: Array<{ turnIndex: number; name: string; message: string }>;
}

/** Output-token efficiency relative to target */
export interface JsonEfficiency {
  /** Actual output tokens produced */
  outputTokens: number;
  /** Target token budget */
  targetTokens: number;
  /** outputTokens / targetTokens as percentage */
  percentage: number;
}

/** LLM judge verdict */
export interface JsonJudge {
  /** Judge pass/fail verdict */
  pass: boolean;
  /** Issues flagged by the judge (empty when passing) */
  issues: string[];
  /** When true, the judge is non-gating: issues are surfaced but do not flip
   * the overall result to fail (the scenario's deterministic checks are
   * authoritative). Set per-scenario via `judgeAdvisory`. */
  advisory?: boolean;
  /** Provider that produced the verdict (absent in older results) */
  provider?: string;
  /** Model that produced the verdict, as resolved (absent in older results) */
  model?: string;
  /** Who gave the verdict above. Absent in results from runs without
   *  `--jev`, where it was always the LLM judge. When "jev", `provider` is
   *  "jev", `model` is the Jev version and `issues` only name unmet
   *  requirements (Jev gives no explanation). */
  decidedBy?: JudgeDecider;
  /** What Jev said, in a `--jev` run (also when it escalated or failed) */
  jev?: JsonJevJudgment;
  /** The LLM judge's own verdict, when it ran (after a Jev escalation) */
  llm?: JsonLlmVerdict;
}

/** Who decided a judge verdict. */
export type JudgeDecider = "jev" | "llm";

/** An LLM judge's verdict. */
export interface JsonLlmVerdict {
  pass: boolean;
  issues: string[];
  provider?: string;
  model?: string;
}

/** What Jev answered for one judge call. */
export interface JsonJevAnswer {
  /** The Jev route: typesafe, openrouter or vercel */
  route: string;
  /** pass and fail decide the verdict; escalate hands it to the LLM judge */
  verdict: "pass" | "fail" | "escalate";
  /** Why Jev did not decide (present when `verdict` is escalate) */
  escalationReason?: string;
  /** "claims" when every requirement passed and only the claims check kept the
   *  pass from standing (present only on such escalations) */
  escalatedBy?: "claims";
  /** The model version Jev reports */
  model: string;
  /** The lowest requirement or whole-criteria answer; it decides pass or fail
   *  (the claims answer can only turn a pass into an escalation) */
  minProbability: number;
  questions: JsonJevQuestion[];
  /** A graded 0-3 read on the whole run; it does not affect `verdict` */
  outcome: { score: number; level: string; confidence: number };
  inputTokens: number;
  outputTokens: number;
  /** USD, when the route reports it (OpenRouter only) */
  cost?: number;
  /** The transcript was cut to fit Jev's input limit */
  truncated: boolean;
}

/** The Jev call failed, so the LLM judge decided. */
export interface JsonJevFailure {
  route: string;
  verdict: "error";
  escalationReason: string;
}

export type JsonJevJudgment = JsonJevAnswer | JsonJevFailure;

/** One yes/no question Jev answered. */
export interface JsonJevQuestion {
  /** req1, req2, ... for the numbered requirements; "whole" for the criteria;
   *  "claims" for the check of the replies' claims against the tool calls */
  id: string;
  kind: "requirement" | "whole" | "claims";
  /** P(yes) */
  probability: number;
}

export interface JsonTurnRecord {
  turnIndex: number;
  userMessage: string;
  assistantResponse: string;
  toolCalls: JsonToolCall[];
  durationMs: number;
  usage?: JsonTokenUsage;
  /** Generation speed across this turn's model calls */
  timing?: JsonStepTiming;
  /** The reasoning text the transport exposed for the turn, untruncated (a
   *  summary on Codex). Absent when the turn had none or the transport doesn't
   *  expose it. */
  reasoningText?: string;
  /** Why the turn's last model call stopped, as the transport words it.
   *  Absent when the transport doesn't expose it. */
  finishReason?: string;
  /** True when the turn was written into history rather than generated by the
   *  model (the seeded connect turn — see `seed-connect.ts`). Present so a
   *  saved transcript never reads as if the model produced it. */
  seeded?: boolean;
}

export interface JsonToolCall {
  name: string;
  args: Record<string, unknown>;
  /** Tool result text (the payload block alone) */
  result?: string;
  /** Relayed `WARNING:` blocks from the same result, when the tool emitted any */
  warnings?: string[];
  /** Content hashes of the context blocks the tool appended after its payload -
   *  what `ppal-connect` injects. The text for each is in the run's
   *  `blocks/<hash>.txt`, stored once per run rather than once per scenario.
   *  Loaders that feed a judge swap them back to text (`restoreInjectedBlocks`). */
  injectedBlocks?: string[];
  /** Present only when the transport reported MCP `isError: true` */
  isError?: boolean;
}

/** Generation speed, combined over the model calls it covers. */
export interface JsonStepTiming {
  /** Total output tokens over the summed model response time, so a long step
   *  counts for more than a short one. Includes the wait for the first token;
   *  running tools is outside it. */
  outputTokensPerSecond?: number;
  /** Mean time to first token across the steps the SDK could measure, in ms. */
  timeToFirstTokenMs?: number;
}

export interface JsonTokenUsage {
  /** All input, cached or not */
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  /** The part of `inputTokens` read from a prompt cache */
  cacheReadTokens?: number;
  /** The part of `inputTokens` written to a prompt cache */
  cacheWriteTokens?: number;
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
