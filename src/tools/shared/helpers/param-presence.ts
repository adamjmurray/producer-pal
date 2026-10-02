// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";

// A model writing the word instead of leaving the param out: "null" or
// "undefined" as a param's whole value. (A JSON null never gets this far —
// unsetEmptyParams drops it before the schema coerces.)
const COERCED_NULLISH = new Set(["null", "undefined"]);

/**
 * Whether a param's value names something. Nullish, blank, and the words a
 * caller writes for nothing all mean "unset", so a caller that meant to send
 * nothing is never counted as having sent a value. Silent — use
 * {@link namedParam} to read a published param, which also says so.
 * @param value - Raw param value
 * @returns True when the value names something
 */
export function paramNamesSomething(value: unknown): boolean {
  if (value == null) {
    return false;
  }

  if (typeof value !== "string") {
    return true;
  }

  return value.trim() !== "" && !isCoercedNullish(value);
}

/**
 * Whether a param's whole value is only what a JSON null coerced into. Useful
 * where such a value would otherwise count as an entry the caller named.
 * @param value - Raw param value
 * @returns True when the value is "null" or "undefined"
 */
export function isCoercedNullish(value: string): boolean {
  return COERCED_NULLISH.has(value.trim());
}

/**
 * Reads a published param, dropping a value that names nothing. A blank reads
 * as omitted; a coerced null warns first, since the caller meant to send
 * nothing and the schema turned it into a value. Counting it as sent is how a
 * call gets refused, or a value paired with the wrong object.
 * @param value - Raw param value
 * @param label - Param name, for the warning
 * @returns The trimmed value, or undefined when it names nothing
 */
export function namedParam(
  value: string | null | undefined,
  label: string,
): string | undefined {
  const trimmed = value?.trim();

  if (trimmed == null || trimmed === "") {
    return undefined;
  }

  if (!isCoercedNullish(trimmed)) {
    return trimmed;
  }

  console.warn(`${label} "${trimmed}" names nothing`);

  return undefined;
}

/**
 * Reads a target from the canonical `id` param, falling back to a name the tool
 * still accepts (`clipId`, `ids`, ...). The alias only fills in for a caller
 * that did not send `id`. Both arriving with different values means one was
 * about to be dropped in silence, so say which.
 * @param id - The `id` param
 * @param alias - The alias param
 * @param aliasLabel - The alias's name, for the warnings
 * @returns The trimmed value, or undefined when neither names anything
 */
export function namedIdParam(
  id: string | null | undefined,
  alias: string | null | undefined,
  aliasLabel: string,
): string | undefined {
  return namedAliasedParam(id, "id", alias, aliasLabel);
}

/**
 * Reads a target from the canonical `path` param, falling back to `paths`. Same
 * deal as {@link namedIdParam}: `path` already takes a comma-separated list, so
 * the plural is a guess worth catching rather than dropping.
 * @param path - The `path` param
 * @param paths - The `paths` alias param
 * @returns The trimmed value, or undefined when neither names anything
 */
export function namedPathParam(
  path: string | null | undefined,
  paths: string | null | undefined,
): string | undefined {
  return namedAliasedParam(path, "path", paths, "paths");
}

/**
 * Parses a comma-separated string of IDs into an array of trimmed, non-empty strings
 * @param ids - Comma-separated string of IDs (e.g., "1, 2, 3" or "track1,track2")
 * @returns Array of trimmed ID strings
 */
export function parseCommaSeparatedIds(ids?: string | null): string[] {
  if (ids == null) {
    return [];
  }

  return ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Sets properties on a target object, but only for non-null values
 * @param target - The object to set properties on
 * @param properties - Object with key-value pairs to set
 * @returns The target object (for chaining)
 */
export function setAllNonNull(
  target: Record<string, unknown>,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(properties)) {
    if (value != null) {
      target[key] = value;
    }
  }

  return target;
}

/**
 * Creates a new object with all non-null properties from the input object
 * @param obj - Object with key-value pairs
 * @returns New object containing only non-null properties
 */
export function withoutNulls(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value != null) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Folds an alias onto the param it stands in for.
 * @param value - The canonical param's value
 * @param canonical - The canonical param's name
 * @param alias - The alias param's value
 * @param aliasLabel - The alias param's name
 * @returns The trimmed value, or undefined when neither names anything
 */
function namedAliasedParam(
  value: string | null | undefined,
  canonical: string,
  alias: string | null | undefined,
  aliasLabel: string,
): string | undefined {
  const named = namedParam(value, canonical);
  const namedAlias = namedParam(alias, aliasLabel);

  if (named == null) {
    return namedAlias;
  }

  if (namedAlias != null && namedAlias !== named) {
    console.warn(
      `${aliasLabel} "${namedAlias}" ignored — "${canonical}" names the target`,
    );
  }

  return named;
}
