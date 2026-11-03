// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Self-reflection turn injection for eval scenarios
 */

import { styleText } from "node:util";
import { type EvalSession } from "../eval-session.ts";
import { type EvalAssertionResult, type EvalTurnResult } from "../types.ts";
import { isQuietMode } from "./quiet-mode.ts";
import { reasoningFields } from "#evals/chat/shared/reasoning-fields.ts";

/** Assertion types that trigger self-reflection on failure */
const REFLECTABLE_TYPES = new Set(["tool_called", "custom"]);

/**
 * Inject a self-reflection turn if there's an actionable deterministic failure.
 * Mutates the turns array and the failing assertion result (adds reflection to details).
 * Max one reflection per scenario.
 *
 * @param results - Correctness assertion results
 * @param turns - Conversation turns (mutated: reflection turn appended)
 * @param session - Active eval session for sending the reflection message
 */
export async function maybeInjectReflection(
  results: EvalAssertionResult[],
  turns: EvalTurnResult[],
  session: EvalSession,
): Promise<void> {
  const failure = results.find(
    (r) => r.earned < r.maxScore && REFLECTABLE_TYPES.has(r.assertion.type),
  );

  if (!failure) {
    return;
  }

  const prompt = buildReflectionPrompt(failure, turns);

  if (!isQuietMode()) {
    console.log("\n" + styleText("gray", "Injecting self-reflection turn..."));
  }

  const turnStart = Date.now();
  const turnResult = await session.sendMessage(prompt, turns.length + 1);

  const reflectionTurn: EvalTurnResult = {
    turnIndex: turns.length,
    userMessage: prompt,
    assistantResponse: turnResult.text,
    toolCalls: turnResult.toolCalls,
    durationMs: Date.now() - turnStart,
    stepUsages: turnResult.stepUsages,
    stepTimings: turnResult.stepTimings,
    ...reasoningFields(turnResult),
  };

  turns.push(reflectionTurn);

  // Store reflection text on the failing assertion's details
  failure.details ??= {};

  if (typeof failure.details === "object") {
    (failure.details as Record<string, unknown>).reflection = turnResult.text;
  }
}

/**
 * Build a reflection prompt for a failing assertion
 *
 * @param failure - The failing assertion result
 * @param turns - The conversation so far, to name the turn a check looked at
 * @returns Reflection prompt string
 */
export function buildReflectionPrompt(
  failure: EvalAssertionResult,
  turns: EvalTurnResult[] = [],
): string {
  if (failure.assertion.type === "tool_called") {
    const details = failure.details as Record<string, unknown> | undefined;
    const expected = failure.assertion.tool;
    const nameMatchCount = Number(details?.nameMatchCount) || 0;
    const count = Number(details?.count) || 0;
    const where = turnPhrase(turns, failure.assertion.turn);

    if (nameMatchCount === 0) {
      return (
        `${where}, you didn't call ${expected}, which was expected. ` +
        `What about the request led you to respond without it?`
      );
    }

    if (count === 0 && details?.argsSpecified) {
      return (
        `${where}, you called ${expected} but the arguments ` +
        `didn't match what was expected. ${failure.message}. What about the ` +
        `request led you to use different arguments?`
      );
    }

    return (
      `${where}, the expected tool was ${expected} but it wasn't ` +
      `called as expected. ${failure.message}. What about the request or your ` +
      `available tools led you to make that choice?`
    );
  }

  // Custom assertion failure
  const description =
    failure.assertion.type === "custom"
      ? failure.assertion.description
      : failure.message;

  return (
    `The following check failed: "${description}". Can you explain your ` +
    `reasoning for the approach you took?`
  );
}

/**
 * Name the turn a tool_called check looked at, by the user message it answered,
 * so a check on an early turn isn't read as being about the latest one.
 *
 * @param turns - The conversation so far
 * @param turn - The checked turn index, or "any"/undefined for the whole run
 * @returns The phrase that opens the prompt
 */
function turnPhrase(turns: EvalTurnResult[], turn?: number | "any"): string {
  const message = typeof turn === "number" ? turns[turn]?.userMessage : null;

  if (message == null) {
    return "In this conversation";
  }

  const excerpt = message.length > 80 ? `${message.slice(0, 77)}...` : message;

  return `In your reply to "${excerpt}"`;
}
