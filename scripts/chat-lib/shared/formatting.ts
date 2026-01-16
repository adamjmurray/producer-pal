import { inspect } from "node:util";

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
  return (
    "\n╔══════════════════════════════════════════════" +
    "═<THOUGHT>══════════════════════════════════════════════" +
    continueThought(text)
  );
}

/**
 * Format continuation of a thought block
 *
 * @param text - Thought text
 * @returns Formatted thought continuation
 */
export function continueThought(text: string | object): string {
  const str = typeof text === "string" ? text : JSON.stringify(text);

  return (
    "\n" +
    str
      .split("\n")
      .map((line) => `║ ${line}`)
      .join("\n")
  );
}

/**
 * Format the end of a thought block
 *
 * @returns Formatted thought end
 */
export function endThought(): string {
  return (
    "\n╚══════════════════════════════════════════════" +
    "═<end_thought>══════════════════════════════════════════════\n\n"
  );
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
 * @returns Formatted tool result string
 */
export function formatToolResult(result: string | undefined): string {
  return `   ↳ ${truncate(result, 160)}`;
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
