// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z, type ZodType } from "zod";
import {
  carrySchemaTags,
  describeWithTags,
} from "#src/tools/shared/tool-framework/schema-tags.ts";

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

    // describeWithTags, not .describe(): a re-described instance loses its
    // param()/deprecatedParam() tags otherwise, and a deprecated param that
    // also has a mode override would get republished.
    filtered[key] =
      descriptionOverrides && key in descriptionOverrides
        ? describeWithTags(value, descriptionOverrides[key] as string)
        : value;
  }

  if (hasEnumExclusions) {
    for (const [paramName, valuesToExclude] of Object.entries(
      excludeEnumValues,
    )) {
      if (!(paramName in filtered)) continue;
      filtered[paramName] = filterEnumValues(
        filtered[paramName] as ZodType,
        valuesToExclude,
      );
    }
  }

  return filtered;
}

/**
 * Removes enum values from a schema and preserves its description, default,
 * and wrapper structure. Supports two shapes:
 *   - z.array(z.enum([...])).default([])          — array of enums
 *   - z.enum([...]).optional().default(value)     — single optional enum
 *
 * @param schema - Zod schema wrapping an enum (must have .default at the top)
 * @param valuesToExclude - Enum values to remove
 * @returns Rebuilt schema with excluded values removed
 */
function filterEnumValues(schema: ZodType, valuesToExclude: string[]): ZodType {
  // Unwrap using runtime .def access. Zod v4 changed the ZodEnum generic from
  // tuple to Record, making static typing of .exclude() impractical — use
  // runtime unwrap + z.enum() rebuild.
  if (schema.type !== "default") {
    throw new Error(
      "excludeEnumValues requires a schema with .default(...) at the top level (z.array(z.enum([...])).default([]) or z.enum([...]).optional().default(value))",
    );
  }

  const description = schema.description;
  const defaultWrapper = schema as z.ZodDefault<z.ZodType>;
  const defaultValue = defaultWrapper.def.defaultValue;
  const inner = defaultWrapper.def.innerType;

  let enumSchema: z.ZodEnum;
  let isArray = false;
  let isOptional = false;

  if (inner.type === "array") {
    enumSchema = (inner as z.ZodArray).def.element as z.ZodEnum;
    isArray = true;
  } else if (inner.type === "optional") {
    enumSchema = (inner as z.ZodOptional<z.ZodEnum>).def.innerType;
    isOptional = true;
  } else if (inner.type === "enum") {
    enumSchema = inner as z.ZodEnum;
  } else {
    throw new Error(
      `excludeEnumValues: unsupported schema shape (innerType: ${inner.type})`,
    );
  }

  const allValues = enumSchema.options as string[];
  const kept = allValues.filter((v) => !valuesToExclude.includes(v));

  if (kept.length === 0) {
    throw new Error(
      "excludeEnumValues would remove all enum values — at least one must remain",
    );
  }

  const rebuiltEnum = z.enum(kept as [string, ...string[]]);
  let rebuilt: ZodType;

  if (isArray) {
    rebuilt = z.array(rebuiltEnum).default(defaultValue as string[]);
  } else if (isOptional) {
    rebuilt = rebuiltEnum.optional().default(defaultValue as string);
  } else {
    rebuilt = rebuiltEnum.default(defaultValue as string);
  }

  if (description) {
    rebuilt = rebuilt.describe(description);
  }

  // The rebuild is a brand-new instance, so the param()/deprecatedParam() tags
  // have to be moved over by hand — otherwise trimming a deprecated param's
  // enum republishes it.
  return carrySchemaTags(schema, rebuilt);
}
