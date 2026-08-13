// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared utilities for assertion evaluation
 */

import { parseToolResult } from "#evals/chat/mcp.ts";
import { type EvalTurnResult, type ToolCall } from "../types.ts";

/**
 * Get target turns based on assertion's turn specification
 *
 * @param turns - All conversation turns
 * @param turn - Turn specification: number index, "any", or undefined
 * @returns Filtered array of matching turns
 */
export function getTargetTurns(
  turns: EvalTurnResult[],
  turn: number | "any" | undefined,
): EvalTurnResult[] {
  if (turn === "any" || turn == null) {
    return turns;
  }

  return [turns[turn]].filter((t): t is EvalTurnResult => t !== undefined);
}

/**
 * Get all tool calls from turns, optionally filtered by turn
 *
 * @param turns - All conversation turns
 * @param turn - Optional turn filter (number index, "any"/undefined for all)
 * @returns Flat array of tool calls
 */
export function getToolCalls(
  turns: EvalTurnResult[],
  turn?: number | "any",
): ToolCall[] {
  return getTargetTurns(turns, turn).flatMap((t) => t.toolCalls);
}

/**
 * A tool call's result parsed into an object, or null when it has none — which
 * is what a tool ERROR looks like. Errors come back as prose ("Error executing
 * tool 'ppal-create-clip': …", "ERROR: user cancelled MCP tool call"), and
 * every success is a JSON/compact-literal payload, so parsing to an object is
 * what separates the two. Structural on purpose: matching error prose would
 * break the moment a message is reworded.
 *
 * @param call - The tool call to read
 * @returns The parsed result object, or null when absent/unparseable
 */
export function parsedToolResult(
  call: ToolCall,
): Record<string, unknown> | null {
  if (call.result == null) return null;

  try {
    const parsed = parseToolResult(call.result);

    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * The LAST call to `toolName` that actually succeeded.
 *
 * Grading must not read the first call by name. A model that hits a tool error
 * is told to fix the arguments and call again, so the first call is often a
 * discarded failed attempt — reading it grades args that never took effect, or
 * an id that was never created, and fails a model for recovering correctly.
 *
 * Falls back to the last call by name when none succeeded, so a scenario that
 * never got a good call still fails on the payload it was grading rather than
 * on a "not found" message that hides why.
 *
 * @param turns - All turn results
 * @param turn - Turn filter (index, "any", or undefined for all)
 * @param toolName - Tool name to match
 * @returns The last successful call, the last call by name, or undefined
 */
export function lastSuccessfulToolCall(
  turns: EvalTurnResult[],
  turn: number | "any" | undefined,
  toolName: string,
): ToolCall | undefined {
  const calls = getToolCalls(turns, turn).filter((c) => c.name === toolName);

  return (
    calls.toReversed().find((c) => parsedToolResult(c) != null) ?? calls.at(-1)
  );
}

/**
 * Check if actual object contains all keys/values from expected (partial match)
 *
 * @param actual - The actual value to check
 * @param expected - The expected partial object
 * @returns True if actual contains all expected keys with matching values
 */
export function partialMatch(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];

    if (expectedValue === undefined) {
      continue;
    }

    if (!valuesMatch(actualValue, expectedValue)) {
      return false;
    }
  }

  return true;
}

/**
 * Type guard to check if a value is an asymmetric matcher (vitest/jest)
 *
 * @param value - The value to check
 * @returns True if value has asymmetricMatch method
 */
function isAsymmetricMatcher(value: unknown): value is {
  asymmetricMatch: (other: unknown) => boolean;
  // Vitest's matchers describe themselves ("Any<String>", "StringContaining
  // …"), which is what stringifyValue prints.
  toString: () => string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "asymmetricMatch" in value &&
    typeof (value as Record<string, unknown>).asymmetricMatch === "function"
  );
}

/**
 * Check if actual object exactly matches expected (no extra keys allowed)
 *
 * @param actual - The actual value to check
 * @param expected - The expected object (or asymmetric matcher like expect.objectContaining)
 * @returns True if actual has same keys as expected with matching values
 */
export function exactMatch(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  // Handle asymmetric matchers at the top level (e.g., expect.objectContaining)
  if (isAsymmetricMatcher(expected)) {
    return expected.asymmetricMatch(actual);
  }

  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected).filter(
    (k) => expected[k] !== undefined,
  );

  if (actualKeys.length !== expectedKeys.length) {
    return false;
  }

  return partialMatch(actual, expected);
}

/**
 * Recursively compare two values for equality
 *
 * @param actual - The actual value
 * @param expected - The expected value
 * @returns True if values match
 */
function valuesMatch(actual: unknown, expected: unknown): boolean {
  // Handle asymmetric matchers (vitest/jest)
  if (isAsymmetricMatcher(expected)) {
    return expected.asymmetricMatch(actual);
  }

  // Handle arrays - compare length and elements
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (actual.length !== expected.length) {
      return false;
    }

    return expected.every((val, i) => valuesMatch(actual[i], val));
  }

  // Handle objects (non-array) - recursive partial match
  if (
    typeof expected === "object" &&
    expected !== null &&
    typeof actual === "object" &&
    actual !== null &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    return partialMatch(
      actual as Record<string, unknown>,
      expected as Record<string, unknown>,
    );
  }

  // Primitives - direct comparison
  return actual === expected;
}

/**
 * Normalize count specification to min/max range
 *
 * @param count - Count spec (number, range, or undefined)
 * @returns Normalized range with min and optional max
 */
export function normalizeCount(
  count: number | { min?: number; max?: number } | undefined,
): { min: number; max?: number } {
  if (count == null) {
    return { min: 1 };
  }

  if (typeof count === "number") {
    return { min: count, max: count };
  }

  return { min: count.min ?? 1, max: count.max };
}

/**
 * Format expected count for error messages
 *
 * @param expected - Normalized count range
 * @param expected.min - Minimum count
 * @param expected.max - Maximum count (optional)
 * @returns Human-readable string
 */
export function formatExpectedCount(expected: {
  min: number;
  max?: number;
}): string {
  if (expected.max == null) {
    return `at least ${expected.min} time(s)`;
  }

  if (expected.min === expected.max) {
    return `exactly ${expected.min} time(s)`;
  }

  return `${expected.min}-${expected.max} time(s)`;
}

/**
 * Stringify args object with readable asymmetric matcher descriptions
 *
 * @param args - The args object (may contain vitest asymmetric matchers)
 * @returns Human-readable string
 */
export function stringifyArgs(args: Record<string, unknown>): string {
  return stringifyValue(args);
}

/**
 * @param value - Value to stringify (may be a matcher, object, array, or primitive)
 * @returns Human-readable string
 */
function stringifyValue(value: unknown): string {
  if (isAsymmetricMatcher(value)) {
    const sample = (value as { sample?: unknown }).sample;

    // Container matcher (objectContaining, arrayContaining) — recurse into sample
    if (
      typeof sample === "object" &&
      sample !== null &&
      typeof sample !== "function" &&
      !(sample instanceof RegExp)
    ) {
      return stringifyValue(sample);
    }

    // Leaf matcher (any, stringMatching, etc.)
    const name = value.toString();

    if (typeof sample === "function") {
      return `${name}<${(sample as { name: string }).name}>`;
    }

    if (sample instanceof RegExp) {
      return `${name}<${sample.toString()}>`;
    }

    return name;
  }

  if (Array.isArray(value)) {
    return "[" + value.map(stringifyValue).join(", ") + "]";
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${stringifyValue(v)}`,
    );

    return "{" + entries.join(", ") + "}";
  }

  return JSON.stringify(value);
}
