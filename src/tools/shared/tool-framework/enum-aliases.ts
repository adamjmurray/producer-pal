// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// An enum whose old spellings still work. The JSON Schema lists only the
// canonical values, so the model never learns the old ones, but a call that
// sends one validates and reaches the handler as the canonical value — no
// refusal, no warning. Saved user content (memory, custom skills) can keep the
// old spellings for as long as it likes.
//
// Done with `.overwrite()`, a check that rewrites the value without changing
// the schema's type, so it works unchanged on top-level params and on enums
// nested in arrays or objects, in MCP and in REST alike.

import { z } from "zod";
import {
  getSchemaTag,
  tagSchema,
} from "#src/tools/shared/tool-framework/schema-tags.ts";

/** What an aliased enum accepts beyond the values it publishes. */
export interface EnumAliasInfo {
  /** The published values. */
  canonical: readonly string[];
  /** Old spelling -> the canonical value it means. */
  aliases: Readonly<Record<string, string>>;
  /** Canonical values accepted but left out of the JSON Schema and refusals. */
  hidden: readonly string[];
}

const ENUM_ALIAS_TAG = Symbol("enumAliases");

/**
 * An enum that publishes `canonical` and also accepts each alias, rewriting it
 * to its canonical value during validation.
 * @param canonical - The values to publish
 * @param aliases - Old spelling -> canonical value
 * @param hidden - Canonical values to accept but not publish
 * @returns An enum schema typed as its canonical values
 */
export function aliasedEnum<const C extends readonly [string, ...string[]]>(
  canonical: C,
  aliases: Readonly<Record<string, C[number]>>,
  hidden: readonly string[] = [],
): z.ZodEnum<{ [K in C[number]]: K }> {
  const accepted = [...canonical, ...Object.keys(aliases)] as [
    string,
    ...string[],
  ];
  const published = canonical.filter((value) => !hidden.includes(value));
  // Same wording as a plain z.enum refusal, minus the aliases and hidden values.
  const refusal = `Invalid option: expected one of ${published
    .map((value) => JSON.stringify(value))
    .join("|")}`;
  const schema = z
    .enum(accepted, { error: () => refusal })
    // The JSON Schema reads this instead of the enum's own options.
    .meta({ enum: published })
    .overwrite((value) => aliases[value] ?? value);

  return tagSchema(schema, ENUM_ALIAS_TAG, {
    canonical,
    aliases,
    hidden,
  } satisfies EnumAliasInfo) as unknown as z.ZodEnum<{ [K in C[number]]: K }>;
}

/**
 * Reads the alias info of an enum built by {@link aliasedEnum}.
 * @param schema - An enum schema
 * @returns Its canonical values and aliases, or undefined for a plain enum
 */
export function getEnumAliases(schema: z.ZodType): EnumAliasInfo | undefined {
  return getSchemaTag(schema, ENUM_ALIAS_TAG) as EnumAliasInfo | undefined;
}
