/**
 * Filters parameters from a Zod schema object based on excluded parameter names
 * and optionally overrides parameter descriptions.
 *
 * @param {Record<string, import("zod").ZodType>} schema - Zod schema object (key-value pairs of parameter names to Zod schemas)
 * @param {string[]} excludeParams - Array of parameter names to exclude
 * @param {Record<string, string>} [descriptionOverrides] - Object mapping parameter names to new descriptions
 * @returns {Record<string, import("zod").ZodType>} New schema object with excluded parameters removed and descriptions overridden
 */
export function filterSchemaForSmallModel(
  schema,
  excludeParams,
  descriptionOverrides,
) {
  const hasExclusions = excludeParams && excludeParams.length > 0;
  const hasOverrides =
    descriptionOverrides && Object.keys(descriptionOverrides).length > 0;

  if (!hasExclusions && !hasOverrides) {
    return schema;
  }

  /** @type {Record<string, import("zod").ZodType>} */
  const filtered = {};

  for (const [key, value] of Object.entries(schema)) {
    if (excludeParams?.includes(key)) continue;

    filtered[key] =
      descriptionOverrides && key in descriptionOverrides
        ? value.describe(descriptionOverrides[key])
        : value;
  }

  return filtered;
}
