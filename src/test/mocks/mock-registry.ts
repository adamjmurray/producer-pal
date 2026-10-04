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
  setKeepAllMockWrites,
  setMockIdAtPath,
} from "./registry/mock-registry-helpers.ts";
import {
  type MockRegistryAccess,
  applyMockInsert,
  applyMockMove,
  applyMockRemoval,
  newMockId,
  resetMockCreatedIds,
} from "./registry/mock-live-set-edits.ts";
import { clearMockWrites } from "./registry/mock-write-log.ts";

export type { RegisteredMockObject, RegisteredMockObjectOptions };

const registryById = new Map<string, RegisteredMockObject>();
const registryByPath = new Map<string, RegisteredMockObject>();
const pendingByPath = new Map<string, RegisteredMockObject>();

setMockIdAtPath((path) => registryByPath.get(path)?.id);

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

  if (existing) {
    applyRegistrationOptions(existing, options);
  }

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
 * Prepare an object that exists only once something creates it at its path:
 * the track a `duplicate_track` call makes, the scene a `create_scene` makes.
 * The returned mock is the handle to assert on, but nothing can reach it until
 * a creating call lands on its path, and the model uses it instead of making an
 * object with an id of its own. Register it up front with
 * {@link registerMockObject} and the insert would move it along, as it should
 * any object that was already there.
 * @param idOrPath - Object ID (bare or "id X" format)
 * @param options - Mock configuration, with the path it will appear at
 * @returns The mock, not yet part of the Live Set
 */
export function registerPendingMockObject(
  idOrPath: PathLike,
  options: RegisteredMockObjectOptions = {},
): RegisteredMockObject {
  const mock = createRegistration(
    normalizeId(String(idOrPath)),
    options,
    defaultMockCall,
  );

  pendingByPath.set(mock.path, mock);

  return mock;
}

/**
 * Put the pending objects at a path and under it into the Live Set, and make a
 * new object with an id of its own if none was pending at the path itself.
 *
 * A pending object stays pending, so it appears again for the next thing
 * created at its path. One that is still in the Live Set is left where it is.
 * @param path - Where it lands
 * @returns The object now at that path
 */
function createMockObject(path: string): RegisteredMockObject {
  for (const [pendingPath, mock] of pendingByPath) {
    const here = pendingPath === path || pendingPath.startsWith(`${path} `);

    if (here && (mock.deleted || registryById.get(mock.id) !== mock)) {
      mock.deleted = false;
      mock.path = pendingPath;
      registryById.set(mock.id, mock);
      registryByPath.set(pendingPath, mock);
      deletedIds.delete(mock.id);
      deletedIds.delete(pendingPath.replaceAll(/\s+/g, "/"));
      refreshHolders(mock);
    }
  }

  clearLiveApiMemo();

  return registryByPath.get(path) ?? registerMockObject(newMockId(), { path });
}

/**
 * Make a parameter keep something other than the value written to it, the way
 * Live clamps and snaps a DeviceParameter.
 *
 * The set mock stores a `display_value` write verbatim, so a test that writes a
 * level and asserts the same number back passes just as well against code that
 * echoes the argument instead of reading it. Use this wherever the assertion is
 * meant to prove a read-back.
 * @param param - The registered DeviceParameter mock
 * @param kept - What the parameter reads as after a write
 */
export function keepsParamValue(
  param: RegisteredMockObject,
  kept: unknown,
): void {
  param.set.mockImplementation((property: string) => {
    param.properties[property] = kept;
  });
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

    if (byId) {
      return byId;
    }
  }

  if (path != null) {
    return registryByPath.get(String(path));
  }

  return undefined;
}

let _simulateDeletes = false;
let _simulateMoves = false;
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
 * Make `move_device` calls move their device, so what is moved reads from its
 * new place and the devices around both places shift the way they do in Live.
 *
 * Off by default: most tests that move a device register where it lands by
 * hand, and a mock that moved it as well would shift what they placed.
 */
export function simulateMockMoves(): void {
  _simulateMoves = true;
}

/**
 * Make set() keep a write to any property, so a later read sees it the way it
 * would in Live.
 *
 * Off by default, and only the tool-reference examples turn it on. A mock that
 * kept every write would pass code that echoes its argument instead of reading
 * the object back.
 */
export function simulateMockWrites(): void {
  setKeepAllMockWrites(true);
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
    // Rounded the same six significant digits as storedParamValue, and a
    // number, which is what Max returns for a label with no unit. Code that
    // checks a write compares the label asked for against the label read back,
    // so a constant would pass every write and an unrounded value would fail
    // every fractional one.
    case "str_for_value":
      return Number(Number(args[0]).toPrecision(6));
    case "guess_playback_length":
      return 4;
    default:
      return structuralCall(method, args, path);
  }
}

/**
 * A call that inserts, duplicates, or deletes. Inserts always take effect;
 * deletes only when a test asked for them (see simulateMockDeletes).
 * @param method - Live API method name
 * @param args - Call arguments
 * @param path - The calling object's path
 * @returns The mocked return value
 */
function structuralCall(
  method: string,
  args: unknown[],
  path: string,
): unknown {
  // Live returns ["id", N] from the creating calls on success. A blanket null
  // would put every uncovered test on the failure branch by accident.
  const inserted = applyMockInsert(registryAccess, method, args, path);

  if (inserted) {
    return inserted.value;
  }

  if (_simulateDeletes) {
    applyMockDelete(method, args, path);
  }

  if (_simulateMoves && method === "move_device") {
    applyMockMove(registryAccess, args);
  }

  return null;
}

/** The registry as the structural edits see it. */
const registryAccess: MockRegistryAccess = {
  all: () =>
    [...new Set(registryById.values())].filter((mock) => !mock.deleted),
  lookup: (idOrPath) => lookupMockObject(idOrPath, idOrPath),
  create: createMockObject,
  relocate(moves) {
    for (const [mock] of moves) {
      if (registryByPath.get(mock.path) === mock) {
        registryByPath.delete(mock.path);
      }
    }

    for (const [mock, path] of moves) {
      mock.path = path;
      registryByPath.set(path, mock);
      deletedIds.delete(path.replaceAll(/\s+/g, "/"));
      refreshHolders(mock);
    }
  },
  markGone: (path) => {
    deletedIds.add(path.replaceAll(/\s+/g, "/"));
  },
};

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
    // Track.delete_clip takes "id N". ClipSlot.delete_clip takes nothing and
    // deletes the clip in the slot.
    deleteMockObject(
      args.length === 0 ? `${path} clip` : String(args[0]).replace(/^id /, ""),
    );
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

  if (rack == null || Number.isNaN(note)) {
    return;
  }

  const chains = rack.properties.chains;

  if (!Array.isArray(chains)) {
    return;
  }

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
 * `tools/actions/delete/helpers/delete-object-by-type.ts` depends on that split.
 *
 * Exported for the fixtures whose own `call` implementations destroy something
 * — an arrangement create clears the range it writes to — since those never
 * reach {@link defaultMockCall} and so aren't covered by simulateMockDeletes.
 * @param idOrPath - The object's ID or path
 */
export function deleteMockObject(idOrPath: string): void {
  const mock = lookupMockObject(idOrPath, idOrPath);

  if (!mock) {
    dropPendingMockObject(idOrPath);

    return;
  }

  const path = mock.path;

  killMockObject(mock);
  applyMockRemoval(registryAccess, path, killMockObject);
}

/**
 * A pending object that is deleted before anything creates it never arrives.
 * @param idOrPath - The object's ID or path
 */
function dropPendingMockObject(idOrPath: string): void {
  for (const [path, mock] of pendingByPath) {
    if (path === idOrPath || mock.id === idOrPath) {
      pendingByPath.delete(path);
      deletedIds.add(mock.id);
      deletedIds.add(path.replaceAll(/\s+/g, "/"));
    }
  }
}

/**
 * Mark one object dead and drop it from the registry's lookups.
 * @param mock - The object to kill
 */
function killMockObject(mock: RegisteredMockObject): void {
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
  pendingByPath.clear();
  deletedIds.clear();
  _simulateDeletes = false;
  _simulateMoves = false;
  setKeepAllMockWrites(false);
  _nonExistentByDefault = false;
  resetMockCreatedIds();
  clearMockWrites();
}
