// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type definitions for the Producer Pal evaluation system
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type ConfigOptions } from "#evals/shared/config.ts";
import { type Notation } from "#src/shared/notation.ts";
import { type ToolCall } from "#evals/chat/shared/types.ts";
import { type TokenUsage } from "#webui/chat/sdk/types.ts";

// Re-export types from chat for convenience
export type { TurnResult, ToolCall } from "#evals/chat/shared/types.ts";

// Re-export ConfigOptions for convenience
export type { ConfigOptions };

export type EvalProvider =
  | "anthropic"
  | "claude-code"
  | "codex-code"
  | "google"
  | "local"
  | "openai"
  | "openrouter";

/**
 * A test scenario that runs against Ableton Live
 */
export interface EvalScenario {
  /** Unique scenario identifier */
  id: string;

  /** Human-readable description */
  description: string;

  /** Whether this is a regression test (should always pass) or capability test
   * (improvement target, may have low pass rates). Default: "regression" */
  kind?: "regression" | "capability";

  /** Live Set name or path. Short names (no `/`) resolve to
   * `evals/live-sets/{name} Project/{name}.als` */
  liveSet: string;

  /** Conversation messages (multi-turn support) */
  messages: string[];

  /** Assertions to run after conversation completes */
  assertions: EvalAssertion[];

  /** Set to `false` to keep the opening "Connect to Ableton Live" turn as a
   *  real model turn instead of seeding it (see `seed-connect.ts`). Needed by
   *  scenarios that GRADE that turn — its prose, or what it did or didn't write
   *  — since a seeded turn's reply is canned. Everything else leaves this
   *  unset: the turn is seeded whenever `messages[0]` is the connect message
   *  and something follows it. */
  seedConnect?: boolean;

  /** When true, the llm_judge assertion is advisory: its issues are still run
   * and reported, but a judge "fail" does NOT flip the overall result to fail.
   * Use for scenarios whose deterministic (state/custom) assertions already pin
   * the exact outcome — there the judge adds qualitative commentary but is an
   * unreliable gate (LLM judges miscount bar|beat notation). Default: false. */
  judgeAdvisory?: boolean;

  /** System instructions override. Default: SYSTEM_INSTRUCTION from
   *  #src/shared. Set to null for no instructions. */
  instructions?: string | null;

  /** Optional config to apply before running scenario */
  config?: ConfigOptions;

  /** Capability requirements gating this scenario. When the active run
   *  environment (CLI flags — small-model mode, the `--tools` subset) can't
   *  satisfy them, the scenario is SKIPPED (reported as `skipped`, not `fail`)
   *  so e.g. small-model scores stay apples-to-apples — the model isn't graded
   *  on capabilities it was never given. Evaluated by `shouldSkipScenario`. */
  requires?: ScenarioRequirements;

  /** Optional async setup run after the MCP session is created but before the
   *  first message turn. Use to reset Live Set state (e.g. clear stale clip
   *  slots) so a run against an already-open Set — a `reuseLiveSet` scenario,
   *  or any scenario under `--skip-setup` — starts from a clean slate. */
  setup?: (mcpClient: Client) => Promise<void>;

  /** Optional async cleanup run after the turns and assertions complete —
   *  success OR failure — while the MCP session is still open. Use to restore
   *  state a `setup` seeded OUTSIDE the Live Set and outside `config`, which
   *  the runner's `resetConfig()` cannot revert: chiefly the machine-global
   *  context document (~/.producer-pal/context.md) and memory entries
   *  (~/.producer-pal/memory/), which are real files on the machine running
   *  Live. Without this, an eval that seeds them would leave them behind in the
   *  developer's own config. A throw here is logged and swallowed so it can't
   *  mask the scenario's real result. */
  teardown?: (mcpClient: Client) => Promise<void>;

  /** When true, the runner may skip reopening the Live Set and run against an
   *  already-open one — an open costs seconds of app launch + save-dialog
   *  handling, so a run of N such scenarios pays it once. Only honored when the
   *  PREVIOUS scenario used the same `liveSet`.
   *
   *  Opt in only when the scenario starts from a clean slate on its own: either
   *  it touches no Live Set state, or its `setup` resets everything it writes
   *  (e.g. `clearClipSlots` on the slots it fills). The flag also lets
   *  repeat trials (`-r N`) and extra `-m` models reuse the open Set; without
   *  it each of those reopens, which is the default fresh-Set isolation most
   *  clip/track/device scenarios depend on. */
  reuseLiveSet?: boolean;
}

/**
 * Capability requirements for a scenario. A requirement that the active run
 * environment cannot satisfy causes the scenario to be skipped (not failed).
 */
export interface ScenarioRequirements {
  /** Tool names that must be available. Checked against the run's `--tools`
   *  subset (short or full names accepted); skipped when the subset excludes
   *  any of them. NOTE: small-model mode excludes no whole standard tools (only
   *  the opt-in `ppal-live-api`), so it never trips this — its exclusion surface
   *  is params, handled by `params` below. This field bites only when the run
   *  restricts `--tools`. */
  tools?: string[];

  /** Param names the scenario depends on. Skipped under `smallModelMode` when
   *  any is in the small-model excluded-param surface
   *  (`SMALL_MODEL_EXCLUDED_PARAMS`: params a mode hides, plus deprecated ones
   *  no mode publishes). Use for scenarios whose deterministic checks require a
   *  param small models never receive — e.g. update-device `actions`,
   *  update-clip `split`. */
  params?: string[];

  /** Needs the transforms DSL (functions like `step()`/`swing()`/`legato()`/
   *  `rand()`, synced LFOs). Not taught in the basic skills tier, so skipped
   *  under `smallModelMode`. */
  transforms?: boolean;

  /** Needs `[...]` pitch/value/duration bracket (stream) notation. Not taught
   *  in the basic skills tier, so skipped under `smallModelMode`. */
  brackets?: boolean;

  /** Explicit frontier-only escape hatch. Skipped under `smallModelMode`. */
  largeModel?: boolean;
}

/**
 * Union of all assertion types
 */
export type EvalAssertion =
  | ToolCallAssertion
  | StateAssertion
  | LlmJudgeAssertion
  | ResponseContainsAssertion
  | CustomAssertion
  | TokenUsageAssertion;

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
  /** Arguments for the tool, or a function that derives them from the completed
   *  turns (e.g. to read the just-created clip by the id it returned, wherever
   *  the model placed it). */
  args:
    | Record<string, unknown>
    | ((turns: EvalTurnResult[]) => Record<string, unknown>);
  /** Expected partial result or matcher function */
  expect: Record<string, unknown> | ((result: unknown) => boolean);
  /** Optional human-readable diagnostic for a FAILED `expect`, given the same
   *  parsed result. Its string is attached to the failure `details.diff` and
   *  appended to the console message so custom matchers (e.g. midi-json note
   *  comparison) can explain WHAT diverged instead of reporting a bare boolean. */
  explain?: (result: unknown) => string;
  /** When set, flip the server notation to this (via POST /config) BEFORE the
   *  read, so the tool serializes notes in a known format regardless of the
   *  notation the model wrote in. Lets a grading read pull clean midi-json
   *  instead of re-interpreting the model's notation. */
  notation?: Notation;
}

/**
 * Use LLM to judge response quality — single-pass pass/fail evaluation.
 * The judge sees the conversation transcript, deterministic check results,
 * and the prompt criteria, then returns pass/fail with a list of issues.
 */
export interface LlmJudgeAssertion {
  type: "llm_judge";
  /** Criteria the judge should evaluate against */
  prompt: string;
  /** Provider for judge (default: same as scenario) */
  judgeProvider?: EvalProvider;
  /** Model for judge */
  judgeModel?: string;
}

/**
 * Simple text/regex matching on response.
 *
 * NON-GATING. These patterns grade the words a model chose, not what it did, so
 * the list of acceptable synonyms is unbounded and drifts with every model — a
 * model that makes exactly the right edit and calls it "turned those up" instead
 * of "boosted" is not a regression. They still run and still report (as
 * "Signals"), but a state or custom assertion has to pin the outcome.
 * See `isSignalAssertion`.
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
 * Track token usage relative to a target budget. Informational only — does not
 * contribute to pass/fail. Displayed as a percentage of target in the efficiency section.
 */
export interface TokenUsageAssertion {
  type: "token_usage";
  /** Which token metric to check */
  metric: "inputTokens" | "outputTokens" | "reasoningTokens";
  /** Target token budget */
  maxTokens: number;
  /** Which turn to check (0-indexed), or "all" for combined (default: "all") */
  turn?: number | "all";
}

/**
 * General-purpose callback assertion for flexible checks on turn data
 * (token usage, tool call patterns, response content, timing, etc.)
 */
export interface CustomAssertion {
  type: "custom";
  /** Human-readable description of what's being checked */
  description: string;
  /** Callback receiving all turn results. Return true for pass, false for fail.
   *  Throw to fail with message. */
  assert: (turns: EvalTurnResult[]) => boolean;
}

/**
 * Result of a single conversation turn
 */
export interface EvalTurnResult {
  turnIndex: number;
  userMessage: string;
  assistantResponse: string;
  toolCalls: ToolCall[];
  durationMs: number;
  stepUsages?: TokenUsage[];
  /** True when this turn was written into history rather than generated by the
   *  model (see `seed-connect.ts`). Nothing about it grades the model. */
  seeded?: boolean;
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
  /** Run-environment label for this run (e.g. "default", "small-model").
   *  See `envLabel` in run-env.ts. */
  configProfileId?: string;
  /** Resolved system instructions used for this run */
  instructions?: string;
  turns: EvalTurnResult[];
  assertions: EvalAssertionResult[];
  totalDurationMs: number;
  totalUsage?: TokenUsage;
  error?: string;
}
