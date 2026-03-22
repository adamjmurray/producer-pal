// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Human-readable labels for eval assertions
 */

import { type EvalAssertion } from "../../types.ts";

/**
 * Build a descriptive label for an assertion in summary tables
 *
 * @param assertion - The assertion to label
 * @returns Descriptive label string
 */
export function assertionLabel(assertion: EvalAssertion): string {
  switch (assertion.type) {
    case "tool_called":
      return `tool_called: ${assertion.tool}`;
    case "state":
      return `state: ${assertion.tool}`;
    case "response_contains":
      return `response_contains: ${assertion.pattern}`;
    case "token_usage":
      return `token_usage: ${assertion.metric} ≤ ${formatTokenLabel(assertion.maxTokens)}`;
    case "custom":
      return assertion.description;
    case "llm_judge":
      return "llm_judge";
  }
}

/**
 * Format a token count for labels (e.g. 20000 → "20k")
 *
 * @param count - Token count
 * @returns Formatted string
 */
export function formatTokenLabel(count: number): string {
  if (count >= 1000) {
    const k = count / 1000;

    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }

  return String(count);
}
