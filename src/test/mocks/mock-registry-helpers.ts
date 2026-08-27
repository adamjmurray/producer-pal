// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Mock, vi } from "vitest";
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

/**
 * One Live object, as the mock models it.
 *
 * This is the identity a held `LiveAPI` binds to, so everything that can change
 * under it — properties, path, whether it still exists — is mutable state read
 * at call time rather than captured when the mock was built. That is what lets
 * a held object follow its target across an index shift and go half-stale on a
 * delete, the way a real one does.
 */
export interface RegisteredMockObject {
  /** Instance-level vi.fn() for get() — use in assertions */
  get: Mock;
  /** Instance-level vi.fn() for set() — use in assertions */
  set: Mock;
  /** Instance-level vi.fn() for call() — use in assertions */
  call: Mock;
  /** The bare numeric ID (e.g., "123") */
  id: string;
  /** The path (e.g., "live_set tracks 0"), rewritten when siblings shift */
  path: string;
  /** The Live API type (e.g., "Track") */
  type: LiveObjectType;
  /** Property overrides to be copied onto LiveAPI instances */
  properties: Record<string, unknown>;
  /** Method implementations for call() dispatch */
  methods: Record<string, (...args: unknown[]) => unknown>;
  /** Path to return from .path getter (overrides path if set) */
  returnPath?: string;
  /** True once a simulated delete removed it from the Live Set */
  deleted: boolean;
  /** Per-property MockSequence read counters, reset on re-registration */
  sequenceCounts: Record<string, number>;
  /** Callbacks held LiveAPI instances install, so updates reach their copies */
  refreshers: Set<() => void>;
}

/** call() fallback for a method the registration doesn't implement */
export type FallbackCall = (
  method: string,
  args: unknown[],
  path: string,
) => unknown;

/**
 * Build a registration and its instance-level mocks.
 * @param id - The bare ID
 * @param options - Mock configuration
 * @param fallbackCall - call() fallback for unimplemented methods
 * @returns The new registration
 */
export function createRegistration(
  id: string,
  options: RegisteredMockObjectOptions,
  fallbackCall: FallbackCall,
): RegisteredMockObject {
  const mock: RegisteredMockObject = {
    get: vi.fn() as Mock,
    set: vi.fn() as Mock,
    call: vi.fn() as Mock,
    id,
    path: "",
    type: "Device",
    properties: {},
    methods: {},
    deleted: false,
    sequenceCounts: {},
    refreshers: new Set(),
  };

  mock.get = createGetMock(mock);
  mock.set = createSetMock(mock);
  mock.call = createCallMock(mock, fallbackCall);
  applyRegistrationOptions(mock, options);

  return mock;
}

/**
 * Re-describe an existing registration in place, so objects already holding it
 * see the change — which is what a held LiveAPI does in Live. An omitted `path`
 * means "same object, new state", not "moved to no path".
 * @param mock - The registration to update
 * @param options - Mock configuration
 */
export function applyRegistrationOptions(
  mock: RegisteredMockObject,
  options: RegisteredMockObjectOptions,
): void {
  const path = options.path != null ? String(options.path) : mock.path;

  mock.path = path;
  mock.type = options.type ?? (path ? detectTypeFromPath(path) : "Device");
  mock.returnPath = options.returnPath;
  mock.deleted = false;
  // Adopt the caller's bags rather than copying them: tests mutate the object
  // they passed in to grow a child list, and get() has to see that.
  mock.properties = options.properties ?? {};
  mock.methods = options.methods ?? {};
  mock.sequenceCounts = {};
  refreshHolders(mock);
}

/**
 * Tell every held LiveAPI to re-copy what it took off this registration.
 * @param mock - The registration that changed
 */
export function refreshHolders(mock: RegisteredMockObject): void {
  for (const refresh of mock.refreshers) refresh();
}

/**
 * Create a get() mock with property-based dispatch
 * @param mock - The registration to read through
 * @returns Configured vi.fn() mock
 */
function createGetMock(mock: RegisteredMockObject): Mock {
  return vi.fn().mockImplementation((prop: string) => {
    // A deleted object reads nothing in Live, even though its id still lies.
    if (mock.deleted) return [];

    const override = mock.properties[prop];

    if (override !== undefined) {
      if (override instanceof MockSequence) {
        const callIndex = (mock.sequenceCounts[prop] ??= 0);

        mock.sequenceCounts[prop]++;

        return [override[callIndex]];
      }

      return Array.isArray(override) ? override : [override];
    }

    // Unknown props (not overridden, no type default) return [] so
    // getProperty() yields undefined — matching real Live under
    // noUncheckedIndexedAccess. A [0] default let under-specified tests pass
    // by reading the index-0 fallback for a property they never registered.
    return getPropertyByType(mock.type, prop, mock.path) ?? [];
  }) as Mock;
}

/**
 * Create a set() mock. Writes to `value` land in `properties` so a later get()
 * sees them: code that reads a parameter back to check the write took would
 * otherwise see every write as rejected. Every other property stays a pure spy.
 *
 * `value` is snapped to a 32-bit float, which is how Live stores a
 * DeviceParameter — a raw 0.8 reads back as 0.800000011920929, and the display
 * label rounds from there.
 * @param mock - The registration to write into
 * @returns Configured vi.fn() mock
 */
function createSetMock(mock: RegisteredMockObject): Mock {
  return vi.fn().mockImplementation((property: string, ...args: unknown[]) => {
    if (
      property === "value" &&
      args.length === 1 &&
      typeof args[0] === "number"
    ) {
      mock.properties.value = Math.fround(args[0]);
    }
  }) as Mock;
}

/**
 * Create a call() mock with method-based dispatch
 * @param mock - The registration to dispatch through
 * @param fallbackCall - Fallback for methods the registration doesn't implement
 * @returns Configured vi.fn() mock
 */
function createCallMock(
  mock: RegisteredMockObject,
  fallbackCall: FallbackCall,
): Mock {
  return vi.fn().mockImplementation((method: string, ...args: unknown[]) => {
    const methodImpl = mock.methods[method];

    if (methodImpl) return methodImpl(...args);

    return fallbackCall(method, args, mock.path);
  }) as Mock;
}
