/**
 * Shared judge response parsing logic
 */

export interface JudgeResult {
  score: number;
  reasoning: string;
}

/**
 * Parse the judge response JSON with fallback extraction
 *
 * @param text - Raw text response from the LLM
 * @returns Parsed judge result with score and reasoning
 */
export function parseJudgeResponse(text: string): JudgeResult {
  try {
    const result = JSON.parse(text) as JudgeResult;

    if (
      typeof result.score !== "number" ||
      typeof result.reasoning !== "string"
    ) {
      throw new Error("Invalid judge response format");
    }

    return result;
  } catch {
    // Try to extract JSON from response if it has extra text.
    // This regex is intentionally simple - it only matches flat objects without
    // nested braces. The expected format is {"score": N, "reasoning": "..."}
    // which should never have nested braces. This is a best-effort fallback.
    const jsonMatch = /{[^}]+}/.exec(text);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]) as JudgeResult;

      if (
        typeof result.score === "number" &&
        typeof result.reasoning === "string"
      ) {
        return result;
      }
    }

    throw new Error(`Failed to parse judge response: ${text}`);
  }
}
