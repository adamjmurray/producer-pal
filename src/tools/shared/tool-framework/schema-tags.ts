// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Per-param metadata carried alongside a Zod schema without changing its type:
// the modal overrides param() attaches, and the deprecation deprecatedParam()
// attaches.
//
// Tags key off the schema INSTANCE, and `.describe()` returns a new one, so
// anything that re-describes a param must carry the tags across or they are lost
// — a deprecated param gets republished, a modal param stops resolving its
// modes. Re-describe through describeWithTags(), never `.describe()` directly.

import { type ZodType } from "zod";

const TAGS = new WeakMap<ZodType, Map<symbol, unknown>>();

/**
 * Attaches a tag to a schema instance.
 * @param schema - The schema to tag
 * @param key - Tag key, owned by the module that defines the tag
 * @param value - Tag value
 * @returns The same schema
 */
export function tagSchema<T extends ZodType>(
  schema: T,
  key: symbol,
  value: unknown,
): T {
  const tags = TAGS.get(schema) ?? new Map<symbol, unknown>();

  tags.set(key, value);
  TAGS.set(schema, tags);

  return schema;
}

/**
 * Reads a tag off a schema instance.
 * @param schema - The schema to read
 * @param key - Tag key
 * @returns The tag value, or undefined if the schema has no such tag. Cast at
 *   the call site — only the tag's owning module knows its type.
 */
export function getSchemaTag(schema: ZodType, key: symbol): unknown {
  return TAGS.get(schema)?.get(key);
}

/**
 * Re-describes a schema, carrying its tags onto the new instance.
 * @param schema - The schema to re-describe
 * @param description - The new description
 * @returns The described schema, with the original's tags
 */
export function describeWithTags<T extends ZodType>(
  schema: T,
  description: string,
): T {
  const described = schema.describe(description);
  const tags = TAGS.get(schema);

  if (tags != null) TAGS.set(described, new Map(tags));

  return described;
}
