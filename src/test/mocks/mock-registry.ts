// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Mock, vi } from "vitest";
import { clearLiveApiMemo } from "#src/live-api-adapter/live-api-release.ts";
import { type PathLike } from "#src/shared/live-api-path-builders.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";
import {
  MockSequence,
  detectTypeFromPath,
  getPropertyByType,
} from "./mock-live-api-property-helpers.ts";

export interface RegisteredMockObjectOptions {
  /** Path for the Live API object (e.g., "live_set tracks 0") */
  path?: PathLike;
  /** Type override (e.g., "Track", "Clip"). Auto-detected from path if omitted. */
  type?: LiveObjectType;
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
  type: LiveObjectType;
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
  type: LiveObjectType,
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

    // Unknown props (not overridden, no type default) return [] so
    // getProperty() yields undefined — matching real Live under
    // noUncheckedIndexedAccess. A [0] default let under-specified tests pass
    // by reading the index-0 fallback for a property they never registered.
    return getPropertyByType(type, prop, path) ?? [];
  }) as Mock;
}

/**
 * Create a call() mock with method-based dispatch
 * @param methods - Method implementations
 * @param path - The object's path, which positional deletes are relative to
 * @returns Configured vi.fn() mock
 */
function createCallMock(
  methods: Record<string, (...args: unknown[]) => unknown>,
  path: string,
): Mock {
  return vi.fn().mockImplementation((method: string, ...args: unknown[]) => {
    const methodImpl = methods[method];

    if (methodImpl) return methodImpl(...args);

    return defaultMockCall(method, args, path);
  }) as Mock;
}

/**
 * Register a mock Live API object with instance-level mocks.
 * @param idOrPath - Object ID (bare or "id X" format) or path
 * @param options - Mock configuration
 * @returns Registered mock object with instance-level get/set/call mocks
 */
export function registerMockObject(
  idOrPath: PathLike,
  options: RegisteredMockObjectOptions = {},
): RegisteredMockObject {
  // Re-registering mid-test is how a test says the Live Set changed underneath
  // the code — a Save-As, a locator inserted, a device moved. Real requests get
  // a fresh memo each time, so drop it here too rather than letting a memoized
  // object keep answering from the registration it was built against.
  clearLiveApiMemo();

  const id = normalizeId(String(idOrPath));
  const path = options.path != null ? String(options.path) : "";
  const type = options.type ?? (path ? detectTypeFromPath(path) : "Device");
  const properties = options.properties ?? {};
  const methods = options.methods ?? {};
  const returnPath = options.returnPath;

  const mock: RegisteredMockObject = {
    get: createGetMock(properties, type, path),
    set: vi.fn() as Mock,
    call: createCallMock(methods, path),
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
  path?: PathLike,
): RegisteredMockObject | undefined {
  if (id != null) {
    const byId = registryById.get(id);

    if (byId) return byId;
  }

  if (path != null) {
    return registryByPath.get(String(path));
  }

  return undefined;
}

let _simulateDeletes = false;
const deletedIds = new Set<string>();

/**
 * Make `delete_*` calls remove their target, so exists() goes false afterward
 * the way it does in Live.
 *
 * Off by default, and only ppal-delete's tests turn it on. Everything else that
 * deletes (update-clip's arrangement moves, the tiling holding area) goes on
 * reading the clip it just deleted, and a mock that took those deletes
 * literally would change what those tests exercise.
 */
export function simulateMockDeletes(): void {
  _simulateDeletes = true;
}

/**
 * Check whether an ID names an object a simulated delete removed.
 * @param id - Bare ID, or a path with its spaces replaced by slashes
 * @returns true if the object was deleted
 */
export function isMockObjectDeleted(id?: string): boolean {
  return id != null && deletedIds.has(id);
}

/**
 * Live version reported by `get_version_string` when a test doesn't register
 * `live_app` itself. Newest supported, so version-gated features are on by
 * default and a test that wants an older Live says so explicitly.
 */
export const MOCK_LIVE_VERSION = "12.4";

/**
 * Default call() behavior, shared by registered and unregistered mocks.
 * @param method - Live API method name
 * @param args - Call arguments
 * @param path - The calling object's path
 * @returns The mocked return value
 */
export function defaultMockCall(
  method: string,
  args: unknown[],
  path: string,
): unknown {
  switch (method) {
    case "get_version_string":
      return MOCK_LIVE_VERSION;
    case "get_notes_extended":
      return JSON.stringify({ notes: [] });
    default:
      if (_simulateDeletes) applyMockDelete(method, args, path);

      return null;
  }
}

/** Collection each `delete_*` method removes from, relative to the caller. */
const DELETE_COLLECTIONS: Record<string, string> = {
  delete_track: "tracks",
  delete_return_track: "return_tracks",
  delete_scene: "scenes",
  delete_device: "devices",
};

/**
 * Apply a `delete_*` call to the registry, so the target reads as gone.
 * @param method - Live API method name
 * @param args - Call arguments
 * @param path - The calling object's path
 */
function applyMockDelete(method: string, args: unknown[], path: string): void {
  const collection = DELETE_COLLECTIONS[method];

  if (collection) {
    deleteMockObject(`${path} ${collection} ${String(args[0])}`);
  } else if (method === "delete_clip") {
    // Track.delete_clip takes "id N". ClipSlot.delete_clip takes nothing, and
    // nothing is registered at the path that builds, so it misses harmlessly.
    deleteMockObject(String(args[0]).replace(/^id /, ""));
  } else if (method === "delete_all_chains") {
    deleteChainsOnPad(path);
  }
}

/**
 * Clear a drum pad the way Live does: every chain of the pad's rack routed to
 * the pad's note goes away. Nothing happens when the rack registers no chains,
 * which is how most pad tests are set up.
 * @param padPath - The DrumPad's path
 */
function deleteChainsOnPad(padPath: string): void {
  const note = Number(padPath.match(/ drum_pads (\d+)$/)?.[1]);
  const rack = lookupMockObject(
    undefined,
    padPath.replace(/ drum_pads \d+$/, ""),
  );

  if (rack == null || Number.isNaN(note)) return;

  const chains = rack.properties.chains;

  if (!Array.isArray(chains)) return;

  // children() interleaves "id" with each child ID.
  for (const chainId of chains.filter((_, index) => index % 2 === 1)) {
    const chain = lookupMockObject(String(chainId));

    if (chain != null && effectiveInNote(chain) === note) {
      deleteMockObject(String(chainId));
    }
  }
}

/**
 * The note a chain currently sounds on. set() is a spy that leaves `properties`
 * alone, so a chain moved during the test has to be read from its writes.
 * @param chain - The chain mock
 * @returns Its in_note
 */
function effectiveInNote(chain: RegisteredMockObject): unknown {
  const writes = chain.set.mock.calls.filter(([prop]) => prop === "in_note");

  return writes.length > 0 ? writes.at(-1)?.[1] : chain.properties.in_note;
}

/**
 * Mark a registered object gone: lookups miss it and exists() goes false, the
 * way a deleted object reads in Live.
 * @param idOrPath - The object's ID or path
 */
function deleteMockObject(idOrPath: string): void {
  const mock = lookupMockObject(idOrPath, idOrPath);

  if (!mock) return;

  // Record both forms, so the object reads as gone however it is reached: by
  // the id the caller already holds, or by a path lookup afterward.
  deletedIds.add(mock.id);
  registryById.delete(mock.id);

  if (mock.path) {
    deletedIds.add(mock.path.replaceAll(/\s+/g, "/"));
    registryByPath.delete(mock.path);
  }
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
  clearLiveApiMemo();
  registryById.clear();
  registryByPath.clear();
  deletedIds.clear();
  _simulateDeletes = false;
  _nonExistentByDefault = false;
}
