// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A dependency-free, model-agnostic token estimate for sizing context in the UI
// (the skills preview and, later, the project/global/instructions editors). We
// deliberately avoid a real tokenizer: bundling one adds weight and exact-version
// churn, and there is no single "correct" count across Claude / Gemini / local
// models anyway. ~4 characters per token is the well-worn English/markdown rule
// of thumb — good enough for the relative comparison ("which combination is
// cheaper") this surfaces. Always label the result as approximate in the UI.

/** Average characters per token for the estimate (English/markdown heuristic). */
const CHARS_PER_TOKEN = 4;

/**
 * Rough token count for a string (character count / 4, rounded up). Approximate
 * by design — see the file header. An empty string is 0 tokens.
 *
 * @param text - The text to size
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
