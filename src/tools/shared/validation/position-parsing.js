import {
  parseCommaSeparatedIds,
  parseCommaSeparatedIndices,
} from "#src/tools/shared/utils.js";

/**
 * Parses a comma-separated string of scene indices into an array of integers
 * @param {string | null | undefined} input - Comma-separated scene indices (e.g., "0" or "0,2,5")
 * @returns {number[]} - Array of scene indices
 */
export function parseSceneIndexList(input) {
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
 * @param {string | null | undefined} input - Comma-separated positions (e.g., "1|1" or "1|1,2|1,3|3")
 * @returns {string[]} - Array of bar|beat position strings
 */
export function parseArrangementStartList(input) {
  return parseCommaSeparatedIds(input);
}
