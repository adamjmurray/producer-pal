/**
 * Parses a comma-separated string of scene indices into an array of integers
 * @param {string} input - Comma-separated scene indices (e.g., "0" or "0,2,5")
 * @returns {number[]} - Array of scene indices
 */
export function parseSceneIndexList(input) {
  if (input == null) {
    return [];
  }
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => {
      const num = parseInt(s, 10);
      if (isNaN(num) || num < 0) {
        throw new Error(
          `invalid sceneIndex "${s}" - must be a non-negative integer`,
        );
      }
      return num;
    });
}

/**
 * Parses a comma-separated string of bar|beat positions into an array
 * @param {string} input - Comma-separated positions (e.g., "1|1" or "1|1,2|1,3|3")
 * @returns {string[]} - Array of bar|beat position strings
 */
export function parseArrangementStartList(input) {
  if (input == null) {
    return [];
  }
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}
