// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  normalizeIdLike,
  resolveMappedObjectProperties,
} from "#src/test/helpers/path-mapped-mock-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { mockTrackProperties } from "./read-track-test-helpers.ts";

interface SetupTrackPathMappedMocksOptions {
  trackPath?: string;
  trackId?: string;
  pathIdMap?: Record<string, string>;
  objects: Record<string, Record<string, unknown>>;
}

/**
 * Register track read mocks using legacy path->id mappings and object maps.
 * @param options - Path-mapped setup options
 * @param options.trackPath - Track path to register
 * @param options.trackId - Fallback track ID
 * @param options.pathIdMap - Optional mapping of paths to IDs
 * @param options.objects - Object properties keyed by "Track", object ID, or path
 */
export function setupTrackPathMappedMocks({
  trackPath = String(livePath.track(0)),
  trackId = "track1",
  pathIdMap = {},
  objects,
}: SetupTrackPathMappedMocksOptions): void {
  const normalizedPathIds = new Map<string, string>();

  for (const [path, id] of Object.entries(pathIdMap)) {
    normalizedPathIds.set(path, normalizeIdLike(id));
  }

  const resolvedTrackId =
    normalizedPathIds.get(trackPath) ??
    normalizeIdLike(pathIdMap[trackPath] ?? trackId);
  const trackProperties = {
    ...(objects.Track ?? mockTrackProperties()),
    ...resolveMappedObjectProperties(objects, resolvedTrackId, trackPath),
  };

  registerMockObject(resolvedTrackId, {
    path: trackPath,
    type: "Track",
    properties: trackProperties,
  });

  const registeredIds = new Set([resolvedTrackId]);
  const registeredPaths = new Set([trackPath]);

  for (const [path, rawId] of normalizedPathIds.entries()) {
    if (path === trackPath) {
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
    if (key === "Track") {
      continue;
    }

    if (registeredIds.has(key) || registeredPaths.has(key)) {
      continue;
    }

    if (isLiveApiPathKey(key)) {
      registerMockObject(defaultClipIdFromPath(key), {
        path: key,
        properties,
      });
      registeredPaths.add(key);
      continue;
    }

    const normalizedId = normalizeIdLike(key);

    if (registeredIds.has(normalizedId)) {
      continue;
    }

    registerMockObject(normalizedId, {
      properties,
    });
    registeredIds.add(normalizedId);
  }
}

function isLiveApiPathKey(key: string): boolean {
  return (
    key.startsWith("live_set ") ||
    key === "live_set" ||
    key.startsWith("this_device")
  );
}

function defaultClipIdFromPath(path: string): string {
  return path.replaceAll(/\s+/g, "/");
}
