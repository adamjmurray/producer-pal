// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ZodType } from "zod";

/**
 * Filters parameters from a Zod schema object based on excluded parameter names
 * and optionally overrides parameter descriptions.
 *
 * @param schema - Zod schema object (key-value pairs of parameter names to Zod schemas)
 * @param excludeParams - Array of parameter names to exclude
 * @param descriptionOverrides - Object mapping parameter names to new descriptions
 * @returns New schema object with excluded parameters removed and descriptions overridden
 */
export function filterSchemaForSmallModel(
  schema: Record<string, ZodType>,
  excludeParams?: string[] | null,
  descriptionOverrides?: Record<string, string>,
): Record<string, ZodType> {
  const hasExclusions = excludeParams && excludeParams.length > 0;
  const hasOverrides =
    descriptionOverrides && Object.keys(descriptionOverrides).length > 0;

  if (!hasExclusions && !hasOverrides) {
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

  return filtered;
}
