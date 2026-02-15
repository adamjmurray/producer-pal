// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Normalize an ID-like string by stripping the "id " prefix if present.
 * @param value - The string to normalize
 * @returns The normalized string
 */
export function normalizeIdLike(value: string): string {
  return value.startsWith("id ") ? value.slice(3) : value;
}

/**
 * Resolve object properties from an objects map by looking up both path and ID keys.
 * @param objects - The objects map to look up properties in
 * @param id - The object ID
 * @param path - The object path
 * @returns Merged properties from path and ID lookups
 */
export function resolveMappedObjectProperties(
  objects: Record<string, Record<string, unknown>>,
  id: string,
  path: string,
): Record<string, unknown> {
  const normalizedId = normalizeIdLike(id);
  const pathProperties = objects[path] ?? {};
  const idProperties =
    objects[normalizedId] ?? objects[`id ${normalizedId}`] ?? {};

  return {
    ...pathProperties,
    ...idProperties,
  };
}
