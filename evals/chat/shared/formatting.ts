// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { inspect } from "node:util";
import { type TokenUsage } from "#webui/chat/ai-sdk/ai-sdk-types.ts";
import {
  calcNewContentTokens,
  compactNumber,
} from "#webui/lib/utils/compact-number.ts";

export const DEBUG_SEPARATOR = "\n" + "-".repeat(80);

// ─────────────────────────────────────────────────────────────────────────────
// Thought formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format the start of a thought block
 *
 * @param text - Thought text
 * @returns Formatted thought start
 */
export function startThought(text: string): string {
  return `\x1b[95m<thought>\n${text}`;
}

/**
 * Format continuation of a thought block
 *
 * @param text - Thought text
 * @returns Formatted thought continuation
 */
export function continueThought(text: string | object): string {
  const content = typeof text === "string" ? text : JSON.stringify(text);

  return `\x1b[95m${content}`;
}

/**
 * Format the end of a thought block
 *
 * @returns Formatted thought end
 */
export function endThought(): string {
  return "\x1b[0m\n";
}

/**
 * Print a complete thought block
 *
 * @param text - Thought text
 * @returns Complete formatted thought block
 */
export function formatThought(text: string): string {
  return startThought(text) + endThought();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool call formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a tool call for display
 *
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns Formatted tool call string
 */
export function formatToolCall(
  name: string,
  args: Record<string, unknown>,
): string {
  return `🔧 ${name}(${inspect(args, { compact: true, depth: 10 })})`;
}

/**
 * Format a tool result for display
 *
 * @param result - Tool result text
 * @returns Formatted tool result string (includes trailing newline for spacing)
 */
export function formatToolResult(result: string | undefined): string {
  return `   ↳ ${truncate(result, 160)}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token usage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print a single step's token usage to the console.
 * @param usage - Token usage for this step
 * @param prev - Previous step's usage (for new content calculation)
 * @param afterText - Whether this follows a text response (needs extra newline)
 */
export function printStepUsage(
  usage: TokenUsage,
  prev: TokenUsage | undefined,
  afterText: boolean,
): void {
  const input = usage.inputTokens ?? 0;
  const newContent = calcNewContentTokens(
    input,
    prev?.inputTokens,
    prev?.outputTokens,
  );

  const newPart =
    newContent != null ? ` (${compactNumber(newContent)} new)` : "";
  const reasoningPart =
    (usage.reasoningTokens ?? 0) > 0
      ? ` (${compactNumber(usage.reasoningTokens ?? 0)} reasoning)`
      : "";

  const line = `tokens: ${compactNumber(input)}${newPart} → ${compactNumber(usage.outputTokens ?? 0)}${reasoningPart}`;
  const prefix = afterText ? "\n\n" : "\n";

  console.log(`${prefix}\x1b[90m  ${line}\x1b[0m\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Fields to abbreviate in debug output */
const VERBOSE_FIELDS = new Set(["tools", "input"]);

/**
 * Strip verbose fields from an object for cleaner debug output
 *
 * @param obj - Object to strip verbose fields from
 * @returns Object with verbose fields abbreviated
 */
function stripVerboseFields(obj: unknown): unknown {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripVerboseFields);

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    result[key] =
      VERBOSE_FIELDS.has(key) && Array.isArray(value)
        ? `[${value.length} items]`
        : stripVerboseFields(value);
  }

  return result;
}

/**
 * Log an object for debugging
 *
 * @param object - Object to log
 */
export function debugLog(object: unknown): void {
  console.log(
    inspect(stripVerboseFields(object), { depth: 10 }),
    DEBUG_SEPARATOR,
  );
}

/**
 * Log a function call for debugging
 *
 * @param funcName - Function name
 * @param args - Function arguments
 */
export function debugCall(funcName: string, args: unknown): void {
  console.log(`${funcName}(${inspect(args, { depth: 10 })})`, DEBUG_SEPARATOR);
}

// ─────────────────────────────────────────────────────────────────────────────
// String utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Truncate a string to a maximum length
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to append when truncated
 * @returns Truncated string
 */
export function truncate(
  str: string | undefined,
  maxLength: number,
  suffix = "…",
): string {
  if (!str || str.length <= maxLength) return str ?? "";
  const cutoff = Math.max(0, maxLength - suffix.length);

  return str.slice(0, cutoff) + suffix;
}

// ─────────────────────────────────────────────────────────────────────────────
// Eval output formatting
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_WIDTH = 60;
const MAJOR_SEPARATOR = "=".repeat(SECTION_WIDTH);
const MINOR_SEPARATOR = "-".repeat(SECTION_WIDTH);

/**
 * Format a scenario header box
 *
 * @param id - Scenario ID
 * @param description - Scenario description
 * @param provider - LLM provider
 * @param model - Model name
 * @returns Formatted header string
 */
export function formatScenarioHeader(
  id: string,
  description: string,
  provider: string,
  model: string,
): string {
  return `
${MAJOR_SEPARATOR}
| SCENARIO: ${id}
| Description: ${description}
| Provider: ${provider}
| Model: ${model}`;
}

/**
 * Format a turn header
 *
 * @param turnNumber - Turn number (1-indexed)
 * @returns Formatted turn header
 */
export function formatTurnHeader(turnNumber: number): string {
  return `${MINOR_SEPARATOR}\nTURN ${turnNumber}`;
}

/**
 * Format a colored chat-style turn header
 *
 * @param turnNumber - Turn number (1-indexed)
 * @returns Cyan colored turn header with ── glyphs
 */
export function formatChatTurnHeader(turnNumber: number): string {
  return `\x1b[96m──────── Turn ${turnNumber} ────────\x1b[0m`;
}

/** Gray prompt prefix for user input display */
export const GRAY_PROMPT = "\x1b[90m> \x1b[0m";

/**
 * Format a colored user label for CLI output
 *
 * @returns Green [User] label with trailing newline
 */
export function formatUserLabel(): string {
  return "\x1b[32m[User]\x1b[0m\n";
}

/**
 * Format a colored assistant label for CLI output
 *
 * @returns Yellow [Assistant] label
 */
export function formatAssistantLabel(): string {
  return "\x1b[33m[Assistant]\x1b[0m";
}

/**
 * Format a major section header (e.g., EVALUATION)
 *
 * @param title - Section title
 * @returns Formatted section header
 */
export function formatSectionHeader(title: string): string {
  return `\n${MAJOR_SEPARATOR}\n${title}\n`;
}

/**
 * Format a subsection header (e.g., Correctness Checks)
 *
 * @param title - Subsection title
 * @returns Formatted subsection header
 */
export function formatSubsectionHeader(title: string): string {
  return `${MINOR_SEPARATOR}\n${title}`;
}
