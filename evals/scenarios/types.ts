/**
 * Type definitions for the Producer Pal evaluation system
 */

// Re-export types from chat for convenience
export type { TurnResult, ToolCall } from "#evals/chat/shared/types.ts";

export type EvalProvider = "gemini" | "openai" | "openrouter";

/**
 * A test scenario that runs against Ableton Live
 */
export interface EvalScenario {
  /** Unique scenario identifier */
  id: string;

  /** Human-readable description */
  description: string;

  /** Path to .als file (relative to project root) */
  liveSet: string;

  /** LLM provider (set via CLI --provider flag) */
  provider?: EvalProvider;

  /** Optional model override */
  model?: string;

  /** Conversation messages (multi-turn support) */
  messages: string[];

  /** Assertions to run after conversation completes */
  assertions: EvalAssertion[];

  /** Optional system instructions */
  instructions?: string;
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
  /** Partial match on arguments (deep equality on specified keys) */
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

/**
 * Use LLM to judge response quality
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
  /** Minimum score (1-5) to pass (default: 3) */
  minScore?: number;
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
