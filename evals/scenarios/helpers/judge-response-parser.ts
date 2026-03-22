// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared judge response parsing logic
 */

export interface DimensionScore {
  score: number;
  reasoning: string;
}

export interface JudgeResult {
  accuracy: DimensionScore;
  reasoning: DimensionScore;
  efficiency: DimensionScore;
  naturalness: DimensionScore;
  overall: number;
}

interface RawJudgeResponse {
  accuracy: DimensionScore;
  reasoning: DimensionScore;
  efficiency: DimensionScore;
  naturalness: DimensionScore;
}

const DIMENSIONS = [
  "accuracy",
  "reasoning",
  "efficiency",
  "naturalness",
] as const;

/**
 * Validate that a dimension score has the correct structure
 *
 * @param dim - The dimension score to validate
 * @returns True if valid
 */
function isValidDimensionScore(dim: unknown): dim is DimensionScore {
  return (
    typeof dim === "object" &&
    dim !== null &&
    typeof (dim as DimensionScore).score === "number" &&
    typeof (dim as DimensionScore).reasoning === "string"
  );
}

/**
 * Validate that a raw response has all required dimensions
 *
 * @param raw - The raw parsed JSON
 * @returns True if all dimensions are valid
 */
function isValidRawResponse(raw: unknown): raw is RawJudgeResponse {
  if (typeof raw !== "object" || raw === null) return false;
  const obj = raw as Record<string, unknown>;

  return DIMENSIONS.every((dim) => isValidDimensionScore(obj[dim]));
}

/**
 * Parse the judge response JSON with fallback extraction
 *
 * @param text - Raw text response from the LLM
 * @returns Parsed judge result with dimension scores and overall average
 */
export function parseJudgeResponse(text: string): JudgeResult {
  const raw = extractJson(text);

  if (!isValidRawResponse(raw)) {
    throw new Error(`Invalid judge response format: ${text}`);
  }

  const overall =
    (raw.accuracy.score +
      raw.reasoning.score +
      raw.efficiency.score +
      raw.naturalness.score) /
    4;

  return { ...raw, overall };
}

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
  if (typeof raw !== "object" || raw === null) return false;
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

  // Extract JSON with nested braces (for dimension objects)
  const match = /{[\S\s]*}/.exec(text);

  if (match) {
    return JSON.parse(match[0]);
  }

  throw new Error(`Failed to extract JSON from: ${text}`);
}
