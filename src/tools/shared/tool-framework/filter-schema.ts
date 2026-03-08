// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z, type ZodType } from "zod";

/**
 * Filters parameters from a Zod schema object based on excluded parameter names,
 * optionally overrides parameter descriptions, and removes enum values.
 *
 * @param schema - Zod schema object (key-value pairs of parameter names to Zod schemas)
 * @param excludeParams - Array of parameter names to exclude
 * @param descriptionOverrides - Object mapping parameter names to new descriptions
 * @param excludeEnumValues - Object mapping parameter names to enum values to remove
 * @returns New schema object with excluded parameters removed and descriptions overridden
 */
export function filterSchemaForSmallModel(
  schema: Record<string, ZodType>,
  excludeParams?: string[] | null,
  descriptionOverrides?: Record<string, string>,
  excludeEnumValues?: Record<string, string[]>,
): Record<string, ZodType> {
  const hasExclusions = excludeParams && excludeParams.length > 0;
  const hasOverrides =
    descriptionOverrides && Object.keys(descriptionOverrides).length > 0;
  const hasEnumExclusions =
    excludeEnumValues && Object.keys(excludeEnumValues).length > 0;

  if (!hasExclusions && !hasOverrides && !hasEnumExclusions) {
    return schema;
  }

  const filtered: Record<string, ZodType> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (excludeParams?.includes(key)) continue;

    filtered[key] =
      descriptionOverrides && key in descriptionOverrides
        ? value.describe(descriptionOverrides[key] as string)
        : value;
  }

  if (hasEnumExclusions) {
    for (const [paramName, valuesToExclude] of Object.entries(
      excludeEnumValues,
    )) {
      if (!(paramName in filtered)) continue;
      filtered[paramName] = filterArrayEnumValues(
        filtered[paramName] as ZodType,
        valuesToExclude,
      );
    }
  }

  return filtered;
}

/**
 * Removes enum values from a z.array(z.enum([...])).default([]) schema
 * and preserves the description and default.
 *
 * @param schema - Zod schema wrapping an array of enums (with optional default)
 * @param valuesToExclude - Enum values to remove
 * @returns Rebuilt schema with excluded values removed
 */
function filterArrayEnumValues(
  schema: ZodType,
  valuesToExclude: string[],
): ZodType {
  // Unwrap ZodDefault<ZodArray<ZodEnum>> using runtime .def access.
  // Zod v4 changed the ZodEnum generic from tuple to Record, making static
  // typing of .exclude() impractical — use runtime unwrap + z.enum() rebuild.
  if (schema.type !== "default") {
    throw new Error(
      "excludeEnumValues requires z.array(z.enum([...])).default([]) schema",
    );
  }

  const description = schema.description;
  const defaultWrapper = schema as z.ZodDefault<z.ZodType>;
  const element = (defaultWrapper.def.innerType as z.ZodArray).def.element;
  const allValues = (element as z.ZodEnum).options as string[];
  const kept = allValues.filter((v) => !valuesToExclude.includes(v));

  if (kept.length === 0) {
    throw new Error(
      "excludeEnumValues would remove all enum values — at least one must remain",
    );
  }

  let rebuilt: ZodType = z
    .array(z.enum(kept as [string, ...string[]]))
    .default(defaultWrapper.def.defaultValue as string[]);

  if (description) {
    rebuilt = rebuilt.describe(description);
  }

  return rebuilt;
}
