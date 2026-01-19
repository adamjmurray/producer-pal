/**
 * Sets properties on a target object, but only for non-null values
 * @param {Record<string, unknown>} target - The object to set properties on
 * @param {Record<string, unknown>} properties - Object with key-value pairs to set
 * @returns {Record<string, unknown>} The target object (for chaining)
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
 * @param {Record<string, unknown>} obj - Object with key-value pairs
 * @returns {Record<string, unknown>} New object containing only non-null properties
 */
export function withoutNulls(obj) {
  /** @type {Record<string, unknown>} */
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
 * @param {string|null|undefined} ids - Comma-separated string of IDs (e.g., "1, 2, 3" or "track1,track2")
 * @returns {Array<string>} Array of trimmed ID strings
 */
export function parseCommaSeparatedIds(ids) {
  if (ids == null) return [];

  return ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Parses a comma-separated string of indices into an array of integers
 * @param {string|null|undefined} indices - Comma-separated string of indices (e.g., "0, 1, 2")
 * @returns {Array<number>} Array of integer indices
 * @throws {Error} If any index is not a valid integer
 */
export function parseCommaSeparatedIndices(indices) {
  if (indices == null) return [];

  return indices
    .split(",")
    .map((index) => index.trim())
    .filter((index) => index.length > 0)
    .map((index) => {
      const parsed = Number.parseInt(index);

      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid index "${index}" - must be a valid integer`);
      }

      return parsed;
    });
}

/**
 * Parses a comma-separated string of values into an array of floats, filtering invalid values
 * @param {string|null|undefined} values - Comma-separated string of numbers (e.g., "1.5, -2, 3.14")
 * @returns {Array<number>} Array of valid float values (NaN values are filtered out)
 */
export function parseCommaSeparatedFloats(values) {
  if (values == null) return [];

  return values
    .split(",")
    .map((v) => Number.parseFloat(v.trim()))
    .filter((v) => !Number.isNaN(v));
}

/**
 * Builds an indexed name for batch-created items (clips, tracks, etc.)
 * First item keeps base name, subsequent items get numbered suffix.
 * @param {string|null|undefined} baseName - Base name for the item
 * @param {number} count - Total number of items being created
 * @param {number} index - Current item index (0-based)
 * @returns {string|undefined} - Generated name or undefined if baseName is null
 */
export function buildIndexedName(baseName, count, index) {
  if (baseName == null) return;
  if (count === 1) return baseName;
  if (index === 0) return baseName;

  return `${baseName} ${index + 1}`;
}

/**
 * Unwraps a single-element array to its element, otherwise returns the array
 * Used for tool results that should return a single object when one item,
 * or an array when multiple items.
 * @param {Array<unknown>} array - Array of results
 * @returns {unknown} Single element if array has one item, otherwise the full array
 */
export function unwrapSingleResult(array) {
  return array.length === 1 ? array[0] : array;
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
    numerator: Number.parseInt(/** @type {string} */ (match[1])),
    denominator: Number.parseInt(/** @type {string} */ (match[2])),
  };
}

/**
 * Converts user-facing view names to Live API view names
 * @param {string} view - View name from user interface ("session" or "arrangement")
 * @returns {string} Live API view name ("Session" or "Arranger")
 * @throws {Error} If view name is not recognized
 */
export function toLiveApiView(view) {
  const normalized = view.toLowerCase(); // for added flexibility even though should already be lower case

  switch (normalized) {
    case "session":
      return "Session";
    case "arrangement":
      return "Arranger"; // Live API still uses "Arranger"
    default:
      throw new Error(`Unknown view: ${view}`);
  }
}

/**
 * Converts Live API view names to user-facing view names
 * @param {string} liveApiView - Live API view name ("Session" or "Arranger")
 * @returns {string} User-facing view name ("session" or "arrangement")
 * @throws {Error} If view name is not recognized
 */
export function fromLiveApiView(liveApiView) {
  switch (liveApiView) {
    case "Session":
      return "session";
    case "Arranger":
      return "arrangement"; // Live API uses "Arranger" but we use "arrangement"
    default:
      throw new Error(`Unknown Live API view: ${liveApiView}`);
  }
}

/**
 * Asserts a value is defined, throwing if null/undefined. Used for type narrowing.
 * @template T
 * @param {T} value - Value to check
 * @param {string} msg - Error message if undefined
 * @returns {NonNullable<T>} The value, narrowed to exclude null/undefined
 */
export function assertDefined(value, msg) {
  if (value == null) {
    throw new Error(`Bug: ${msg}`);
  }

  return value;
}
