// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  parseCommaSeparatedIds,
  parseCommaSeparatedIndices,
} from "#src/tools/shared/utils.ts";

/**
 * Parses a comma-separated string of scene indices into an array of integers
 * @param input - Comma-separated scene indices (e.g., "0" or "0,2,5")
 * @returns Array of scene indices
 */
export function parseSceneIndexList(input?: string | null): number[] {
  const indices = parseCommaSeparatedIndices(input);

  for (const num of indices) {
    if (num < 0) {
      throw new Error(
        `invalid sceneIndex "${num}" - must be a non-negative integer`,
      );
    }
  }

  return indices;
}

/**
 * Parses a comma-separated string of bar|beat positions into an array
 * @param input - Comma-separated positions (e.g., "1|1" or "1|1,2|1,3|3")
 * @returns Array of bar|beat position strings
 */
export function parseArrangementStartList(input?: string | null): string[] {
  return parseCommaSeparatedIds(input);
}
