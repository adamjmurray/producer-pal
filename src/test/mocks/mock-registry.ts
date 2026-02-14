// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Mock, vi } from "vitest";
import type { PathLike } from "#src/shared/live-api-path-builders.ts";
import {
  MockSequence,
  detectTypeFromPath,
  getPropertyByType,
} from "./mock-live-api-property-helpers.ts";

export interface RegisteredMockObjectOptions {
  /** Path for the Live API object (e.g., "live_set tracks 0") */
  path?: PathLike;
  /** Type override (e.g., "Track", "Clip"). Auto-detected from path if omitted. */
  type?: string;
  /** Property overrides for get() calls, keyed by property name */
  properties?: Record<string, unknown>;
  /** Method implementations for call() dispatch, keyed by method name */
  methods?: Record<string, (...args: unknown[]) => unknown>;
  /**
   * Path to return from .path getter (overrides registered path).
   * Used for objects like "live_set view selected_track" that should return
   * the actual track's path instead of the view path.
   */
  returnPath?: string;
}

export interface RegisteredMockObject {
  /** Instance-level vi.fn() for get() — use in assertions */
  get: Mock;
  /** Instance-level vi.fn() for set() — use in assertions */
  set: Mock;
  /** Instance-level vi.fn() for call() — use in assertions */
  call: Mock;
  /** The bare numeric ID (e.g., "123") */
  id: string;
  /** The path (e.g., "live_set tracks 0") */
  path: string;
  /** The Live API type (e.g., "Track") */
  type: string;
  /** Property overrides to be copied onto LiveAPI instances */
  properties: Record<string, unknown>;
  /** Path to return from .path getter (overrides path if set) */
  returnPath?: string;
}

const registryById = new Map<string, RegisteredMockObject>();
const registryByPath = new Map<string, RegisteredMockObject>();

/**
 * Normalize "id X" format to bare numeric ID.
 * @param idOrPath - Input ID or path string
 * @returns Bare ID (e.g., "123") or original string
 */
function normalizeId(idOrPath: string): string {
  return /^id \d+$/.test(idOrPath) ? idOrPath.slice(3) : idOrPath;
}

/**
 * Create a get() mock with property-based dispatch
 * @param id - Object ID for fallback global mock context
 * @param properties - Property overrides
 * @param type - Object type for fallback defaults
 * @param path - Object path for fallback defaults
 * @returns Configured vi.fn() mock
 */
function createGetMock(
  properties: Record<string, unknown>,
  type: string,
  path: string,
): Mock {
  const callCounts: Record<string, number> = {};

  return vi.fn().mockImplementation((prop: string) => {
    const override = properties[prop];

    if (override !== undefined) {
      if (override instanceof MockSequence) {
        const callIndex = (callCounts[prop] ??= 0);

        callCounts[prop]++;

        return [override[callIndex]];
      }

      return Array.isArray(override) ? override : [override];
    }

    return getPropertyByType(type, prop, path) ?? [0];
  }) as Mock;
}

/**
 * Create a call() mock with method-based dispatch
 * @param methods - Method implementations
 * @returns Configured vi.fn() mock
 */
function createCallMock(
  methods: Record<string, (...args: unknown[]) => unknown>,
): Mock {
  return vi.fn().mockImplementation((method: string, ...args: unknown[]) => {
    const methodImpl = methods[method];

    if (methodImpl) return methodImpl(...args);

    switch (method) {
      case "get_version_string":
        return "12.3";
      case "get_notes_extended":
        return JSON.stringify({ notes: [] });
      default:
        return null;
    }
  }) as Mock;
}

/**
 * Register a mock Live API object with instance-level mocks.
 * @param idOrPath - Object ID (bare or "id X" format) or path
 * @param options - Mock configuration
 * @returns Registered mock object with instance-level get/set/call mocks
 */
export function registerMockObject(
  idOrPath: string,
  options: RegisteredMockObjectOptions = {},
): RegisteredMockObject {
  const id = normalizeId(idOrPath);
  const path = options.path != null ? String(options.path) : "";
  const type = options.type ?? (path ? detectTypeFromPath(path) : "Unknown");
  const properties = options.properties ?? {};
  const methods = options.methods ?? {};
  const returnPath = options.returnPath;

  const mock: RegisteredMockObject = {
    get: createGetMock(properties, type, path),
    set: vi.fn() as Mock,
    call: createCallMock(methods),
    id,
    path,
    type,
    properties,
    returnPath,
  };

  registryById.set(id, mock);

  if (path) {
    registryByPath.set(path, mock);
  }

  return mock;
}

/**
 * Look up a registered mock object by ID or path.
 * @param id - Bare ID (e.g., "123")
 * @param path - Object path (e.g., "live_set tracks 0")
 * @returns Registered mock object, or undefined if not registered
 */
export function lookupMockObject(
  id?: string,
  path?: string,
): RegisteredMockObject | undefined {
  if (id != null) {
    const byId = registryById.get(id);

    if (byId) return byId;
  }

  if (path != null) {
    return registryByPath.get(path);
  }

  return undefined;
}

let _nonExistentByDefault = false;

/**
 * Check whether unregistered LiveAPI objects should default to non-existent.
 * Used by the LiveAPI mock class to determine the `id` getter fallback.
 * @returns true if unregistered objects should be non-existent
 */
export function isNonExistentByDefault(): boolean {
  return _nonExistentByDefault;
}

/**
 * Make unregistered LiveAPI objects non-existent (exists() returns false).
 * Registered objects are unaffected since they use instance-level mocks.
 * Use in tests that need to verify behavior for invalid/unknown IDs.
 */
export function mockNonExistentObjects(): void {
  _nonExistentByDefault = true;
}

/**
 * Clear all registered mock objects. Called in beforeEach.
 */
export function clearMockRegistry(): void {
  registryById.clear();
  registryByPath.clear();
  _nonExistentByDefault = false;
}
