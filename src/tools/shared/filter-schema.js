/**
 * Filters parameters from a Zod schema object based on excluded parameter names.
 *
 * @param {Object} schema - Zod schema object (key-value pairs of parameter names to Zod schemas)
 * @param {string[]} excludeParams - Array of parameter names to exclude
 * @returns {Object} New schema object with excluded parameters removed
 */
export function filterSchemaForSmallModel(schema, excludeParams) {
  if (!excludeParams || excludeParams.length === 0) {
    return schema;
  }

  const filtered = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!excludeParams.includes(key)) {
      filtered[key] = value;
    }
  }

  return filtered;
}
