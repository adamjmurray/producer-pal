// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Self-reflection turn injection for eval scenarios
 */

import { styleText } from "node:util";
import { type EvalSession } from "../eval-session.ts";
import { type EvalAssertionResult, type EvalTurnResult } from "../types.ts";
import { isQuietMode } from "./output-config.ts";

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

  if (!failure) return;

  const prompt = buildReflectionPrompt(failure);

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
  };

  turns.push(reflectionTurn);

  // Store reflection text on the failing assertion's details
  if (failure.details && typeof failure.details === "object") {
    (failure.details as Record<string, unknown>).reflection = turnResult.text;
  }
}

/**
 * Build a reflection prompt for a failing assertion
 *
 * @param failure - The failing assertion result
 * @returns Reflection prompt string
 */
function buildReflectionPrompt(failure: EvalAssertionResult): string {
  if (failure.assertion.type === "tool_called") {
    const details = failure.details as Record<string, unknown> | undefined;
    const expected = failure.assertion.tool;
    const count = Number(details?.count) || 0;

    if (count === 0) {
      return (
        `In the previous step, you didn't call any tool, but ${expected} was ` +
        `expected. What about the request led you to respond without using a tool?`
      );
    }

    return (
      `In the previous step, the expected tool was ${expected} but it wasn't ` +
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
