// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

/**
 * Normalize an ID-like string by stripping the "id " prefix if present.
 * @param value - The string to normalize
 * @returns The normalized string
 */
export function normalizeIdLike(value: string): string {
  return value.startsWith("id ") ? value.slice(3) : value;
}

/**
 * Register mock objects for all path->id entries except the primary entity path.
 * @param normalizedPathIds - Map of paths to normalized IDs
 * @param objects - Object properties map
 * @param skipPath - Primary entity path to skip (already registered)
 * @param registeredIds - Set to track registered IDs (mutated)
 * @param registeredPaths - Set to track registered paths (mutated)
 */
export function registerPathMappedObjects(
  normalizedPathIds: Map<string, string>,
  objects: Record<string, Record<string, unknown>>,
  skipPath: string,
  registeredIds: Set<string>,
  registeredPaths: Set<string>,
): void {
  for (const [path, rawId] of normalizedPathIds.entries()) {
    if (path === skipPath) {
      continue;
    }

    registerMockObject(rawId, {
      path,
      properties: resolveMappedObjectProperties(objects, rawId, path),
    });
    registeredIds.add(rawId);
    registeredPaths.add(path);
  }
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
