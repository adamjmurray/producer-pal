// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Detect when an API response came from a different model than requested.
 *
 * Normalizes model IDs by stripping org prefixes and date-style suffixes
 * so that trivial variants (build dates, provider namespacing) don't
 * trigger false-positive mismatches.
 */

/**
 * Check whether the response model is meaningfully different from the
 * requested model — not just a build/date variant or org-prefixed form.
 *
 * Same:      "gpt-4o" vs "gpt-4o-20250301"
 * Same:      "claude-sonnet-4" vs "anthropic/claude-sonnet-4-20250514"
 * Different: "gpt-4o" vs "gpt-4o-mini"
 * Different: "llama-3.1-8b" vs "llama-3.1-70b"
 *
 * @param requested - Model ID that was requested
 * @param actual - Model ID from the API response
 * @returns True when the models are meaningfully different
 */
export function isModelMismatch(requested: string, actual: string): boolean {
  if (requested === actual) return false;

  return normalizeModelId(requested) !== normalizeModelId(actual);
}

// --- Helpers ---

/**
 * Normalize a model ID for comparison by stripping org prefixes
 * and trailing date-style suffixes.
 *
 * "anthropic/claude-sonnet-4-20250514" → "claude-sonnet-4"
 * "gpt-4o-2025-03-01"                 → "gpt-4o"
 * "llama-3.1-8b"                      → "llama-3.1-8b" (unchanged)
 *
 * @param id - Raw model ID
 * @returns Normalized model ID
 */
function normalizeModelId(id: string): string {
  // Strip org prefix: "anthropic/claude-sonnet-4" → "claude-sonnet-4"
  const withoutOrg = id.includes("/")
    ? id.substring(id.lastIndexOf("/") + 1)
    : id;

  // Strip date suffix: YYYYMMDD or YYYY-MM-DD
  return withoutOrg.replace(/-\d{4}(?:-?\d{2}){2}$/, "");
}
