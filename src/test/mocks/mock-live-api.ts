// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { parseIdOrPath } from "#src/live-api-adapter/live-api-path-utils.ts";
import {
  MockSequence,
  children,
  detectTypeFromPath,
  getPropertyByType,
} from "./mock-live-api-property-helpers.ts";
import { type MockObjectHandle, lookupMockObject } from "./mock-registry.ts";

export { MockSequence, children };

/** Context available in mockImplementation callbacks for LiveAPI mocks */
export interface MockLiveAPIContext {
  _path?: string;
  _id?: string;
  path?: string;
  id?: string;
  type?: string;
}

export const liveApiId = vi.fn();
export const liveApiPath = vi.fn();
export const liveApiType = vi.fn();
export const liveApiGet = vi.fn();
export const liveApiSet = vi.fn();
export const liveApiCall = vi.fn();

export class LiveAPI {
  _path?: string;
  _id?: string;
  _registered?: MockObjectHandle;
  get: typeof liveApiGet;
  set: typeof liveApiSet;
  call: typeof liveApiCall;

  constructor(path?: string) {
    this._path = path;
    this._id = path?.startsWith("id ")
      ? path.slice(3)
      : path?.replaceAll(/\s+/g, "/");

    this._registered = lookupMockObject(this._id, this._path);

    if (this._registered) {
      this.get = this._registered.get;
      this.set = this._registered.set;
      this.call = this._registered.call;
    } else {
      this.get = liveApiGet;
      this.set = liveApiSet;
      this.call = liveApiCall;
    }
  }

  /**
   * Create LiveAPI from id or path
   * @param idOrPath - ID or path
   * @returns LiveAPI instance
   */
  static from(idOrPath: string | string[] | number): LiveAPI {
    return new LiveAPI(parseIdOrPath(idOrPath));
  }

  exists(): boolean {
    return this.id !== "id 0" && this.id !== "0";
  }

  get id(): string {
    if (this._registered) return this._registered.id;

    return (liveApiId.apply(this) as string | undefined) ?? this._id ?? "";
  }

  get path(): string {
    if (this._registered) return this._registered.path;

    return (liveApiPath.apply(this) as string | undefined) ?? this._path ?? "";
  }

  get unquotedpath(): string {
    return this.path;
  }

  /**
   * Get child IDs by property name
   * @param name - Property name
   * @returns Array of child IDs
   */
  getChildIds(name: string): string[] {
    const idArray = this.get(name) as unknown[];

    if (!Array.isArray(idArray)) {
      return [];
    }

    const ids: string[] = [];

    for (let i = 0; i < idArray.length; i += 2) {
      if (idArray[i] === "id") {
        ids.push(`id ${String(idArray[i + 1])}`);
      }
    }

    return ids;
  }

  /**
   * Get children by property name
   * @param name - Property name
   * @returns Array of LiveAPI instances
   */
  getChildren(name: string): LiveAPI[] {
    return this.getChildIds(name).map((id) => new LiveAPI(id));
  }

  /**
   * Get property value
   * @param property - Property name
   * @returns Property value
   */
  getProperty(property: string): unknown {
    const result = this.get(property) as unknown[];

    return result[0];
  }

  get type(): string {
    if (this._registered) return this._registered.type;

    const mockedType = liveApiType.apply(this) as string | undefined;

    if (mockedType !== undefined) {
      return mockedType;
    }

    return detectTypeFromPath(this.path, this._id);
  }

  // Extension properties/methods added by live-api-extensions.js at runtime
  // These are stubs for TypeScript - actual implementations come from the extension
  declare trackIndex: number | null;
  declare returnTrackIndex: number | null;
  declare category: "regular" | "return" | "master" | null;
  declare sceneIndex: number | null;
  declare clipSlotIndex: number | null;
  declare deviceIndex: number | null;
  declare timeSignature: string | null;
  declare getColor: () => string | null;
  declare setColor: (cssColor: string) => void;
  declare setProperty: (property: string, value: unknown) => void;
  declare setAll: (properties: Record<string, unknown>) => void;
}

interface MockOverrides {
  [key: string]: Record<string, unknown> & {
    __callCount__?: Record<string, number>;
  };
}

/**
 * Normalize "id X" format keys to bare numeric IDs.
 * Leaves paths (e.g., "live_set tracks 0") and types (e.g., "Track") untouched.
 * @param key - Override key to normalize
 * @returns Bare ID or unchanged key
 */
function normalizeIdKey(key: string): string {
  return /^id \d+$/.test(key) ? key.slice(3) : key;
}

/**
 * Mock the LiveAPI.get() method with optional custom overrides
 * @param overrides - Property overrides by object id/path/type (bare IDs preferred)
 */
export function mockLiveApiGet(overrides: MockOverrides = {}): void {
  const normalized: MockOverrides = {};

  for (const [key, value] of Object.entries(overrides)) {
    normalized[normalizeIdKey(key)] = value;
  }

  liveApiGet.mockImplementation(function (
    this: { id: string; path: string; type: string },
    prop: string,
  ) {
    const overridesByProp =
      normalized[this.id] ?? normalized[this.path] ?? normalized[this.type];

    if (overridesByProp != null) {
      const override = overridesByProp[prop];

      if (override !== undefined) {
        // optionally support mocking a sequence of return values:
        if (override instanceof MockSequence) {
          const callCounts = (overridesByProp.__callCount__ ??= {});
          const callIndex = (callCounts[prop] ??= 0);
          const value = override[callIndex];

          callCounts[prop]++;

          return [value];
        }

        // or non-arrays always return the constant value for multiple calls to LiveAPI.get():
        return Array.isArray(override) ? override : [override];
      }
    }

    const result = getPropertyByType(this.type, prop, this.path);

    return result ?? [0];
  });
}

interface TrackOverrides {
  id?: string;
  type?: string;
  name?: string;
  trackIndex?: number;
  color?: string;
  isArmed?: boolean;
  arrangementFollower?: boolean;
  playingSlotIndex?: number;
  firedSlotIndex?: number;
  arrangementClips?: unknown[];
  sessionClips?: unknown[];
  instrument?: unknown;
  [key: string]: unknown;
}

export const expectedTrack = (
  overrides: TrackOverrides = {},
): TrackOverrides => ({
  id: "1",
  type: "midi",
  name: "Test Track",
  trackIndex: 0,
  color: "#FF0000",
  isArmed: true,
  arrangementFollower: true,
  playingSlotIndex: 2,
  firedSlotIndex: 3,
  arrangementClips: [],
  sessionClips: [],
  instrument: null,
  ...overrides,
});

interface SceneOverrides {
  id?: string;
  name?: string;
  sceneIndex?: number;
  color?: string;
  isEmpty?: boolean;
  tempo?: string;
  timeSignature?: string;
  [key: string]: unknown;
}

export const expectedScene = (
  overrides: SceneOverrides = {},
): SceneOverrides => ({
  id: "1",
  name: "Test Scene",
  sceneIndex: 0,
  color: "#000000",
  isEmpty: false,
  tempo: "disabled",
  timeSignature: "disabled",
  ...overrides,
});

interface ClipOverrides {
  id?: string;
  type?: string;
  view?: string;
  trackIndex?: number;
  sceneIndex?: number;
  name?: string;
  color?: string;
  timeSignature?: string;
  looping?: boolean;
  start?: string;
  end?: string;
  length?: string;
  noteCount?: number;
  notes?: string;
  [key: string]: unknown;
}

// For use with the default behavior in mockLiveApiGet() above
export const expectedClip = (overrides: ClipOverrides = {}): ClipOverrides => ({
  id: "clip1",
  type: "midi",
  view: "session",
  trackIndex: 2,
  sceneIndex: 1,
  name: "Test Clip",
  color: "#3DC300",
  timeSignature: "4/4",
  looping: false,
  start: "1|2", // bar|beat format (1 Ableton beat = bar 1 beat 2)
  end: "2|2", // end_marker (5 beats = 2|2)
  length: "1:0", // 1 bar duration
  // playing, triggered, recording, overdubbing, muted omitted when false
  noteCount: 0,
  notes: "",
  ...overrides,
});

/**
 * Setup standard ID mock for common update/read tests.
 * Maps "id X" paths to return just "X" for IDs 123, 456, 789.
 * Falls back to default MockLiveAPI behavior for other paths.
 */
export function setupStandardIdMock(): void {
  liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
    switch (this._path) {
      case "id 123":
        return "123";
      case "id 456":
        return "456";
      case "id 789":
        return "789";
      default:
        return this._id;
    }
  });
}
