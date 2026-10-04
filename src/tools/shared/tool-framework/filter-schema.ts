// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z, type ZodType } from "zod";
import {
  aliasedEnum,
  getEnumAliases,
} from "#src/tools/shared/tool-framework/enum-aliases.ts";
import {
  carrySchemaTags,
  describeWithTags,
} from "#src/tools/shared/tool-framework/schema-tags.ts";

/** The enum inside a param, plus the wrappers to put back around it. */
interface UnwrappedEnum {
  enumSchema: z.ZodEnum;
  values: string[];
  defaultValue: unknown;
  description: string | undefined;
  isArray: boolean;
  isOptional: boolean;
}

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
    if (excludeParams?.includes(key)) {
      continue;
    }

    // describeWithTags keeps the param()/deprecatedParam() tags on the
    // re-described instance.
    filtered[key] =
      descriptionOverrides && key in descriptionOverrides
        ? describeWithTags(value, descriptionOverrides[key] as string)
        : value;
  }

  if (hasEnumExclusions) {
    applyPerParam(filtered, excludeEnumValues, filterEnumValues);
  }

  return filtered;
}

/**
 * Hides enum values from the JSON Schema while the param still accepts them.
 *
 * The mirror image of {@link filterSchemaForSmallModel}'s enum trim: that one
 * rebuilds the enum, so the value is refused. This one leaves the enum alone
 * and overrides only what the schema advertises, because a value trimmed on
 * `default` mode is one the model is never offered but the handler still
 * honors. Rebuilding it here made the MCP SDK refuse the call before the
 * handler could warn and carry on. Same idea as boundedString (ADR-0021): pick
 * the spelling whose JSON Schema says what the model should read.
 * @param schema - Published schema object
 * @param unpublishedEnumValues - Values to hide, per param
 * @returns New schema object advertising the trimmed enums
 */
export function unpublishEnumValues(
  schema: Record<string, ZodType>,
  unpublishedEnumValues: Record<string, string[]>,
): Record<string, ZodType> {
  if (Object.keys(unpublishedEnumValues).length === 0) {
    return schema;
  }

  const result = { ...schema };

  applyPerParam(result, unpublishedEnumValues, hideEnumValues);

  return result;
}

// --- Helpers below main exports ---

/**
 * Rewrites each named param in place with a per-param transform.
 * @param schema - Schema object to rewrite
 * @param valuesByParam - Enum values to act on, per param
 * @param transform - What to do to one param's schema
 */
function applyPerParam(
  schema: Record<string, ZodType>,
  valuesByParam: Record<string, string[]>,
  transform: (schema: ZodType, values: string[]) => ZodType,
): void {
  for (const [paramName, values] of Object.entries(valuesByParam)) {
    if (!(paramName in schema)) {
      continue;
    }

    schema[paramName] = transform(schema[paramName] as ZodType, values);
  }
}

/**
 * Unwraps a param down to its enum, or throws saying which shape it isn't.
 * Supports two shapes:
 *   - z.array(z.enum([...])).default([])          — array of enums
 *   - z.enum([...]).optional().default(value)     — single optional enum
 * @param schema - Zod schema wrapping an enum (must have .default at the top)
 * @returns The enum and the wrappers around it
 */
function unwrapEnum(schema: ZodType): UnwrappedEnum {
  // Unwrap using runtime .def access. Zod v4 changed the ZodEnum generic from
  // tuple to Record, making static typing of .exclude() impractical — use
  // runtime unwrap + z.enum() rebuild.
  if (schema.type !== "default") {
    throw new Error(
      "excludeEnumValues requires a schema with .default(...) at the top level (z.array(z.enum([...])).default([]) or z.enum([...]).optional().default(value))",
    );
  }

  const defaultWrapper = schema as z.ZodDefault<z.ZodType>;
  const inner = defaultWrapper.def.innerType;
  const common = {
    defaultValue: defaultWrapper.def.defaultValue,
    description: schema.description,
  };

  if (inner.type === "array") {
    const enumSchema = (inner as z.ZodArray).def.element as z.ZodEnum;

    return { ...common, enumSchema, ...enumFacts(enumSchema, true, false) };
  }

  if (inner.type === "optional") {
    const enumSchema = (inner as z.ZodOptional<z.ZodEnum>).def.innerType;

    return { ...common, enumSchema, ...enumFacts(enumSchema, false, true) };
  }

  if (inner.type === "enum") {
    const enumSchema = inner as z.ZodEnum;

    return { ...common, enumSchema, ...enumFacts(enumSchema, false, false) };
  }

  throw new Error(
    `excludeEnumValues: unsupported schema shape (innerType: ${inner.type})`,
  );
}

/**
 * The parts of an unwrapped enum that don't come from the outer wrapper.
 * @param enumSchema - The enum found inside
 * @param isArray - Whether it sat inside an array
 * @param isOptional - Whether it sat inside an optional
 * @returns Its values and where it was
 */
function enumFacts(
  enumSchema: z.ZodEnum,
  isArray: boolean,
  isOptional: boolean,
): Pick<UnwrappedEnum, "values" | "isArray" | "isOptional"> {
  // An aliased enum's own options include its old spellings; only the
  // canonical values are ever offered or trimmed.
  const values =
    getEnumAliases(enumSchema)?.canonical ?? (enumSchema.options as string[]);

  return { values: [...values], isArray, isOptional };
}

/**
 * The values left after a trim, or throws when nothing would remain.
 * @param values - Every value the enum declares
 * @param valuesToRemove - The ones being taken away
 * @returns The values that stay
 */
function keptValues(values: string[], valuesToRemove: string[]): string[] {
  const kept = values.filter((value) => !valuesToRemove.includes(value));

  if (kept.length === 0) {
    throw new Error(
      "excludeEnumValues would remove all enum values — at least one must remain",
    );
  }

  return kept;
}

/**
 * Removes enum values from a schema and preserves its description, default,
 * and wrapper structure.
 * @param schema - Zod schema wrapping an enum (must have .default at the top)
 * @param valuesToExclude - Enum values to remove
 * @returns Rebuilt schema with excluded values removed
 */
function filterEnumValues(schema: ZodType, valuesToExclude: string[]): ZodType {
  const unwrapped = unwrapEnum(schema);
  const kept = keptValues(unwrapped.values, valuesToExclude) as [
    string,
    ...string[],
  ];

  return rewrap(
    schema,
    unwrapped,
    rebuildEnum(unwrapped.enumSchema, kept, valuesToExclude),
  );
}

/**
 * Puts a rebuilt enum back inside the wrappers it came out of.
 * @param schema - The original param schema
 * @param unwrapped - What unwrapEnum found in it
 * @param rebuiltEnum - The enum to put in
 * @returns A new schema with the original's description and tags
 */
function rewrap(
  schema: ZodType,
  unwrapped: UnwrappedEnum,
  rebuiltEnum: ZodType,
): ZodType {
  const { defaultValue, description, isArray, isOptional } = unwrapped;
  let rebuilt: ZodType;

  if (isArray) {
    rebuilt = z.array(rebuiltEnum).default(defaultValue as string[]);
  } else if (isOptional) {
    rebuilt = (rebuiltEnum as z.ZodEnum)
      .optional()
      .default(defaultValue as string);
  } else {
    rebuilt = (rebuiltEnum as z.ZodEnum).default(defaultValue as string);
  }

  if (description) {
    rebuilt = rebuilt.describe(description);
  }

  // The rebuild is a brand-new instance, so the param()/deprecatedParam() tags
  // have to be moved over by hand — otherwise trimming a deprecated param's
  // enum republishes it.
  return carrySchemaTags(schema, rebuilt);
}

/**
 * The enum with the excluded values taken out. An aliased enum keeps the
 * aliases of what stays, so an old spelling of an excluded value is refused
 * along with it.
 * @param enumSchema - The enum being trimmed
 * @param kept - The canonical values that stay
 * @param excluded - The values being taken away
 * @returns A new enum
 */
function rebuildEnum(
  enumSchema: z.ZodEnum,
  kept: [string, ...string[]],
  excluded: string[],
): ZodType {
  const info = getEnumAliases(enumSchema);

  if (info == null) {
    return z.enum(kept);
  }

  const keptAliases = Object.fromEntries(
    Object.entries(info.aliases).filter(
      ([alias, target]) => kept.includes(target) && !excluded.includes(alias),
    ),
  );

  return aliasedEnum(kept, keptAliases, info.hidden);
}

/**
 * Narrows what a param's enum advertises without narrowing what it accepts.
 * @param schema - Zod schema wrapping an enum (must have .default at the top)
 * @param valuesToHide - Enum values to keep out of the JSON Schema
 * @returns The schema, advertising only the values that stay
 */
function hideEnumValues(schema: ZodType, valuesToHide: string[]): ZodType {
  const unwrapped = unwrapEnum(schema);
  const { enumSchema, values, defaultValue, description, isArray } = unwrapped;
  const kept = keptValues(values, valuesToHide);
  const aliases = getEnumAliases(enumSchema);

  // An aliased enum rebuilds so its refusal lists only what stays published.
  if (aliases != null) {
    return rewrap(
      schema,
      unwrapped,
      aliasedEnum(
        aliases.canonical as [string, ...string[]],
        aliases.aliases,
        valuesToHide,
      ),
    );
  }

  // A scalar param is the enum, so the override goes straight on it and the
  // instance (tags and all) is kept.
  if (!isArray) {
    return schema.meta({ enum: kept });
  }

  // An array advertises its values on `items`, so the override has to go on the
  // element — which means rebuilding the array around it.
  let rebuilt: ZodType = z
    .array(enumSchema.meta({ enum: kept }))
    .default(defaultValue as string[]);

  if (description) {
    rebuilt = rebuilt.describe(description);
  }

  return carrySchemaTags(schema, rebuilt);
}
