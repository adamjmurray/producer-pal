// src/utils.js

/**
 * Sets properties on a target object, but only for non-null values
 * @param {Object} target - The object to set properties on
 * @param {Object} properties - Object with key-value pairs to set
 * @returns {Object} The target object (for chaining)
 */
export function setAllNonNull(target, properties) {
  for (const [key, value] of Object.entries(properties)) {
    if (value != null) {
      target[key] = value;
    }
  }
  return target;
}

/**
 * Creates a new object with all non-null properties from the input object
 * @param {Object} obj - Object with key-value pairs
 * @returns {Object} New object containing only non-null properties
 */
export function withoutNulls(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value != null) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Parses a comma-separated string of IDs into an array of trimmed, non-empty strings
 * @param {string} ids - Comma-separated string of IDs (e.g., "1, 2, 3" or "track1,track2")
 * @returns {Array<string>} Array of trimmed ID strings
 */
export function parseCommaSeparatedIds(ids) {
  return ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Parses a comma-separated string of indices into an array of integers
 * @param {string} indices - Comma-separated string of indices (e.g., "0, 1, 2")
 * @returns {Array<number>} Array of integer indices
 * @throws {Error} If any index is not a valid integer
 */
export function parseCommaSeparatedIndices(indices) {
  return indices
    .split(",")
    .map((index) => index.trim())
    .filter((index) => index.length > 0)
    .map((index) => {
      const parsed = parseInt(index, 10);
      if (isNaN(parsed)) {
        throw new Error(`Invalid index "${index}" - must be a valid integer`);
      }
      return parsed;
    });
}

/**
 * Parses a time signature string into numerator and denominator
 * @param {string} timeSignature - Time signature in format "n/m" (e.g., "4/4", "3/4", "6/8")
 * @returns {{numerator: number, denominator: number}} Object with numerator and denominator
 * @throws {Error} If time signature format is invalid
 */
export function parseTimeSignature(timeSignature) {
  const match = timeSignature.match(/^(\d+)\/(\d+)$/);
  if (!match) {
    throw new Error('Time signature must be in format "n/m" (e.g. "4/4")');
  }
  return {
    numerator: parseInt(match[1], 10),
    denominator: parseInt(match[2], 10)
  };
}