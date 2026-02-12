// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  normalizeIdLike,
  resolveMappedObjectProperties,
} from "#src/test/helpers/path-mapped-mock-helpers.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

interface SetupLiveSetPathMappedMocksOptions {
  liveSetPath?: string;
  liveSetId?: string;
  pathIdMap?: Record<string, string>;
  objects: Record<string, Record<string, unknown>>;
  strictNonExistent?: boolean;
}

/**
 * Register live-set test mocks using legacy path->id mappings and object maps.
 * @param options - Path-mapped setup options
 * @param options.liveSetPath - Live Set path to register
 * @param options.liveSetId - Fallback Live Set ID
 * @param options.pathIdMap - Optional mapping of paths to IDs
 * @param options.objects - Object properties keyed by "LiveSet", object ID, or path
 * @param options.strictNonExistent - Return "id 0" for unregistered objects
 */
export function setupLiveSetPathMappedMocks({
  liveSetPath = "live_set",
  liveSetId = "live_set",
  pathIdMap = {},
  objects,
  strictNonExistent = true,
}: SetupLiveSetPathMappedMocksOptions): void {
  if (strictNonExistent) {
    mockNonExistentObjects();
  }

  const normalizedPathIds = new Map<string, string>();

  for (const [path, id] of Object.entries(pathIdMap)) {
    normalizedPathIds.set(path, normalizeIdLike(id));
  }

  const resolvedLiveSetId =
    normalizedPathIds.get(liveSetPath) ??
    normalizeIdLike(pathIdMap[liveSetPath] ?? liveSetId);
  const liveSetProperties = {
    ...createDefaultLiveSetProperties(),
    ...(objects.LiveSet ?? {}),
    ...resolveMappedObjectProperties(objects, resolvedLiveSetId, liveSetPath),
  };

  registerMockObject(resolvedLiveSetId, {
    path: liveSetPath,
    type: "LiveSet",
    properties: liveSetProperties,
  });

  const registeredIds = new Set([resolvedLiveSetId]);
  const registeredPaths = new Set([liveSetPath]);

  for (const [path, rawId] of normalizedPathIds.entries()) {
    if (path === liveSetPath) {
      continue;
    }

    registerMockObject(rawId, {
      path,
      properties: resolveMappedObjectProperties(objects, rawId, path),
    });
    registeredIds.add(rawId);
    registeredPaths.add(path);
  }

  for (const [key, properties] of Object.entries(objects)) {
    if (key === "LiveSet") {
      continue;
    }

    if (registeredPaths.has(key)) {
      continue;
    }

    if (isLiveApiPathKey(key)) {
      const id = key.startsWith("id ")
        ? key.slice(3)
        : defaultIdFromPath(key, normalizedPathIds);

      if (registeredIds.has(id)) {
        continue;
      }

      registerMockObject(id, {
        path: key,
        properties,
      });
      registeredIds.add(id);
      registeredPaths.add(key);
      continue;
    }

    const normalizedId = normalizeIdLike(key);

    if (registeredIds.has(normalizedId)) {
      continue;
    }

    registerMockObject(normalizedId, { properties });
    registeredIds.add(normalizedId);
  }
}

function createDefaultLiveSetProperties(): Record<string, unknown> {
  return {
    tracks: [],
    return_tracks: [],
    scenes: [],
  };
}

function isLiveApiPathKey(key: string): boolean {
  return (
    key.startsWith("live_set ") ||
    key === "live_set" ||
    key.startsWith("live_app") ||
    key.startsWith("id ")
  );
}

function defaultIdFromPath(path: string, pathIds: Map<string, string>): string {
  return pathIds.get(path) ?? path.replaceAll(/\s+/g, "/");
}
