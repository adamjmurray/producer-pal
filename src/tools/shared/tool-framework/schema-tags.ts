// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Per-param metadata carried alongside a Zod schema without changing its type:
// the modal overrides param() attaches, and the deprecation deprecatedParam()
// attaches.
//
// Tags key off the schema INSTANCE, and every Zod builder returns a new one, so
// a lookup falls back to the schema an instance was derived from: what a wrapper
// wraps (`.optional()`, `.nullable()`, `.default()`, `.transform()`, `.pipe()`,
// …) and what a clone came from (`.describe()`, `.refine()`, `.meta()`, and the
// other check builders). Wrapping a tagged param therefore keeps its tags, in
// any order — and a derived schema inherits them whether you want it to or not.
//
// A schema rebuilt from scratch — the enum trim in filter-schema.ts — has no
// link back to the original, so it has to copy the tags with carrySchemaTags()
// or they are lost: a deprecated param gets republished, a modal param stops
// resolving its modes.

import { type ZodType } from "zod";

const TAGS = new WeakMap<ZodType, Map<symbol, unknown>>();

/**
 * The Zod internals a tag lookup follows. Zod sets both links itself: a wrapper
 * holds the schema it wraps (`innerType`, or `in` for a pipe), and a clone
 * points back at the instance it came from — the same `parent` link Zod's own
 * metadata registry inherits descriptions through.
 */
type DerivedSchema = ZodType & {
  _zod: { parent?: ZodType; def: { innerType?: ZodType; in?: ZodType } };
};

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
 * Reads a tag off a schema instance, or off the schema it was derived from.
 * @param schema - The schema to read
 * @param key - Tag key
 * @returns The tag value, or undefined if the schema has no such tag. Cast at
 *   the call site — only the tag's owning module knows its type.
 */
export function getSchemaTag(schema: ZodType, key: symbol): unknown {
  return resolveTags(schema)?.get(key);
}

/**
 * Copies a schema's tags onto another instance. Needed only when the new
 * instance is built from scratch, since Zod's own builders leave a link back.
 * @param from - The schema the tags are on
 * @param to - The schema replacing it
 * @returns The `to` schema
 */
export function carrySchemaTags<T extends ZodType>(from: ZodType, to: T): T {
  const tags = resolveTags(from);

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

/**
 * Resolves the tags in effect on a schema: whatever it inherits from the schema
 * it was derived from, with its own tags winning.
 * @param schema - The schema to resolve
 * @returns The tags in effect, or undefined if it has none
 */
function resolveTags(schema: ZodType): Map<symbol, unknown> | undefined {
  const own = TAGS.get(schema);
  const source = derivedFrom(schema);
  const inherited = source == null ? undefined : resolveTags(source);

  if (inherited == null) return own;

  if (own == null) return inherited;

  return new Map([...inherited, ...own]);
}

/**
 * Finds the schema a Zod builder derived this one from.
 * @param schema - The derived schema
 * @returns The schema it came from, or undefined if it was built from scratch
 */
function derivedFrom(schema: ZodType): ZodType | undefined {
  const { parent, def } = (schema as DerivedSchema)._zod;

  return parent ?? def.innerType ?? def.in;
}
