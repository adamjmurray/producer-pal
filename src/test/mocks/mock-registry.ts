// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { clearLiveApiMemo } from "#src/live-api-adapter/live-api-release.ts";
import { type PathLike } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  type RegisteredMockObjectOptions,
  applyRegistrationOptions,
  createRegistration,
  refreshHolders,
} from "./mock-registry-helpers.ts";

export type { RegisteredMockObject, RegisteredMockObjectOptions };

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
 * Register a mock Live API object, or re-describe one already registered.
 *
 * Re-registering the same id updates that object **in place**, so anything
 * still holding it sees the new state. That is how Live behaves: a held object
 * reads through to its target, it does not answer from a snapshot. Registering
 * a *different* id at the same path is a different object arriving there, and
 * holders of the old one keep reading the old one.
 * @param idOrPath - Object ID (bare or "id X" format) or path
 * @param options - Mock configuration
 * @returns Registered mock object with instance-level get/set/call mocks
 */
export function registerMockObject(
  idOrPath: PathLike,
  options: RegisteredMockObjectOptions = {},
): RegisteredMockObject {
  // Real requests get a fresh memo each time, so drop it here too rather than
  // letting a memoized object keep answering from an earlier registration.
  clearLiveApiMemo();

  const id = normalizeId(String(idOrPath));
  // Live's null id. Registering it means "nothing is here", so each one is its
  // own dead end rather than one object being re-described.
  const existing = id === "0" ? undefined : registryById.get(id);
  const previousPath = existing?.path ?? "";
  const mock = existing ?? createRegistration(id, options, defaultMockCall);

  if (existing) applyRegistrationOptions(existing, options);

  registryById.set(id, mock);
  deletedIds.delete(id);

  // Only vacate the old path if it still names this object — something else may
  // already have been registered there.
  if (previousPath !== mock.path && registryByPath.get(previousPath) === mock) {
    registryByPath.delete(previousPath);
  }

  if (mock.path) {
    registryByPath.set(mock.path, mock);
    deletedIds.delete(mock.path.replaceAll(/\s+/g, "/"));
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
 * Kill a registered object the way Live does.
 *
 * A fresh lookup misses it, but anything already holding it keeps the stale id
 * — only its path clears and its property reads dry up. `confirmDeleted` in
 * `tools/actions/delete/delete.ts` depends on that split.
 * @param idOrPath - The object's ID or path
 */
function deleteMockObject(idOrPath: string): void {
  const mock = lookupMockObject(idOrPath, idOrPath);

  if (!mock) return;

  mock.deleted = true;
  refreshHolders(mock);

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
