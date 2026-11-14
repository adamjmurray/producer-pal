// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Shared judge response parsing logic
 */

/** Simplified judge result — pass/fail with issue list */
export interface SimpleJudgeResult {
  pass: boolean;
  issues: string[];
}

/**
 * Parse a simplified judge response (pass/fail + issues)
 *
 * @param text - Raw text response from the LLM
 * @returns Parsed simple judge result
 */
export function parseSimpleJudgeResponse(text: string): SimpleJudgeResult {
  const raw = extractJson(text);

  if (!isValidSimpleResponse(raw)) {
    throw new Error(`Invalid simple judge response format: ${text}`);
  }

  return { pass: raw.pass, issues: raw.issues };
}

/**
 * Validate that a raw response matches the simple judge format
 *
 * @param raw - The raw parsed JSON
 * @returns True if valid
 */
function isValidSimpleResponse(
  raw: unknown,
): raw is { pass: boolean; issues: string[] } {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }

  const obj = raw as Record<string, unknown>;

  return (
    typeof obj.pass === "boolean" &&
    Array.isArray(obj.issues) &&
    obj.issues.every((item: unknown) => typeof item === "string")
  );
}

/**
 * Extract JSON object from text, handling extra surrounding text
 *
 * @param text - Raw text that may contain JSON
 * @returns Parsed JSON object
 */
function extractJson(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Fall through to extraction
  }

  // Extract first complete JSON object using balanced brace matching
  const start = text.indexOf("{");

  if (start !== -1) {
    let depth = 0;

    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") {
        depth++;
      } else if (text[i] === "}") {
        depth--;
      }

      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }

  throw new Error(`Failed to extract JSON from: ${text}`);
}
