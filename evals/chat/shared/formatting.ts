// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { inspect, styleText } from "node:util";
import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import {
  calcNewContentTokens,
  compactNumber,
} from "#webui/lib/utils/compact-number.ts";

export const DEBUG_SEPARATOR = "\n" + "-".repeat(80);

// ─────────────────────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────────────────────

// 256-color orange — no styleText equivalent, so kept as raw ANSI
const ORANGE = "\x1b[38;5;208m";
const RESET = "\x1b[0m";

/**
 * Apply orange styling to text (256-color, not available in styleText)
 *
 * @param text - Text to style
 * @returns Orange styled text
 */
export function orange(text: string): string {
  return `${ORANGE}${text}${RESET}`;
}

/** Foreground format identifiers accepted by `styleText` */
export type ForegroundFormat =
  | "red"
  | "green"
  | "yellow"
  | "cyan"
  | "cyanBright"
  | "gray"
  | "blueBright"
  | "magenta";

/**
 * Return a `styleText` format based on a score percentage.
 * Green for perfect (100%), cyan for high (90–99%), yellow for mid (50–89%), red for low (<50%).
 *
 * @param earned - Points earned
 * @param max - Maximum possible points
 * @returns styleText foreground format
 */
export function scoreColor(earned: number, max: number): ForegroundFormat {
  if (max === 0) return "gray";
  const pct = (earned / max) * 100;

  return pctColor(pct);
}

/**
 * Return a `styleText` format for a percentage value.
 *
 * @param pct - Percentage (0–100)
 * @returns styleText foreground format
 */
export function pctColor(pct: number): ForegroundFormat {
  if (pct >= 100) return "green";
  if (pct >= 90) return "cyan";
  if (pct >= 50) return "yellow";

  return "red";
}

/**
 * Return a `styleText` format for an efficiency percentage (actual / target).
 * Lower is better: < 50% blue, ≤ 100% green, < 200% yellow, ≥ 200% red.
 *
 * @param pct - Percentage of target (e.g. 150 means 150% of budget)
 * @returns styleText foreground format
 */
export function efficiencyColor(pct: number): ForegroundFormat {
  if (pct < 50) return "blueBright";
  if (pct <= 100) return "green";
  if (pct < 200) return "yellow";

  return "red";
}

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
  return styleText("magenta", `<thought>\n${text}`);
}

/**
 * Format continuation of a thought block
 *
 * @param text - Thought text
 * @returns Formatted thought continuation
 */
export function continueThought(text: string | object): string {
  const content = typeof text === "string" ? text : JSON.stringify(text);

  return styleText("magenta", content);
}

/**
 * Format the end of a thought block
 *
 * @returns Formatted thought end
 */
export function endThought(): string {
  return "\n";
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

  console.log(`${prefix}${styleText("gray", "  " + line)}\n`);
}

/**
 * Format a total usage line for display.
 *
 * @param usage - Total token usage
 * @returns Formatted gray usage string like "Tokens: 12.3K → 4.5K (890 reasoning)"
 */
export function formatUsageLine(usage: TokenUsage): string {
  const input = compactNumber(usage.inputTokens ?? 0);
  const output = compactNumber(usage.outputTokens ?? 0);
  const reasoningPart =
    (usage.reasoningTokens ?? 0) > 0
      ? ` (${compactNumber(usage.reasoningTokens ?? 0)} reasoning)`
      : "";

  return styleText("gray", `Tokens: ${input} → ${output}${reasoningPart}`);
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

${styleText("gray", "_".repeat(SECTION_WIDTH + 12))}

${orange(MAJOR_SEPARATOR)}
${orange(`| SCENARIO: ${id}`)}
${orange("|")} ${styleText("gray", "Description:")} ${description}
${orange("|")} ${styleText("gray", "Provider:")} ${provider}
${orange("|")} ${styleText("gray", "Model:")} ${model}`;
}

/**
 * Format a turn header
 *
 * @param turnNumber - Turn number (1-indexed)
 * @returns Formatted turn header
 */
export function formatTurnHeader(turnNumber: number): string {
  return styleText("cyanBright", `──────── Turn ${turnNumber} ────────`);
}

/** Gray prompt prefix for user input display */
export const GRAY_PROMPT = styleText("gray", "> ");

/**
 * Format a colored user label for CLI output
 *
 * @returns Green [User] label with trailing newline
 */
export function formatUserLabel(): string {
  return styleText("green", "[User]") + "\n";
}

/**
 * Format a colored assistant label for CLI output
 *
 * @returns Yellow [Assistant] label
 */
export function formatAssistantLabel(): string {
  return styleText("yellow", "[Assistant]");
}

/**
 * Format a major section header (e.g., EVALUATION)
 *
 * @param title - Section title
 * @returns Formatted section header
 */
export function formatSectionHeader(title: string): string {
  return `\n${orange(MAJOR_SEPARATOR)}\n${orange(title)}\n`;
}

/**
 * Format a subsection header (e.g., Correctness Checks)
 *
 * @param title - Subsection title
 * @returns Formatted subsection header
 */
export function formatSubsectionHeader(title: string): string {
  return `${styleText("blueBright", MINOR_SEPARATOR)}\n${styleText("blueBright", title)}`;
}
