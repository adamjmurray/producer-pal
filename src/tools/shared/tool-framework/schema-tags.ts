// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Per-param metadata carried alongside a Zod schema without changing its type:
// the modal overrides param() attaches, and the deprecation deprecatedParam()
// attaches.
//
// Tags key off the schema INSTANCE, and every Zod builder — `.describe()`,
// `.optional()`, `.default()`, an enum rebuild — returns a new one. Anything
// that derives a schema from a tagged one must carry the tags across or they are
// lost: a deprecated param gets republished, a modal param stops resolving its
// modes. Re-describe through describeWithTags() and rebuild through
// carrySchemaTags(), never a bare builder call. Tag last when building a param.

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
 * Copies a schema's tags onto another instance. Use whenever a param is rebuilt
 * rather than re-described — `.optional()`, `.default()`, an enum rebuild.
 * @param from - The schema the tags are on
 * @param to - The schema replacing it
 * @returns The `to` schema
 */
export function carrySchemaTags<T extends ZodType>(from: ZodType, to: T): T {
  const tags = TAGS.get(from);

  if (tags != null) TAGS.set(to, new Map(tags));

  return to;
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
  return carrySchemaTags(schema, schema.describe(description));
}
