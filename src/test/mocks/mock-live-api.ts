// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Mock, vi } from "vitest";
import { parseIdOrPath } from "#src/live-api-adapter/live-api-path-utils.ts";
import { type PathLike } from "#src/shared/live-api-path-builders.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";
import {
  MockSequence,
  children,
  detectTypeFromPath,
  getPropertyByType,
} from "./mock-live-api-property-helpers.ts";
import {
  type RegisteredMockObject,
  isNonExistentByDefault,
  lookupMockObject,
} from "./mock-registry.ts";

export { MockSequence, children };

/** Context available in mockImplementation callbacks for LiveAPI mocks */
export interface MockLiveAPIContext {
  _path?: string;
  _id?: string;
  _registered?: RegisteredMockObject;
  path?: string;
  id?: string;
  type?: LiveObjectType;
}

/**
 * Derive the mock id from a path, matching how the real LiveAPI reports one
 * @param path - Path or "id N" string
 * @returns The bare id
 */
function deriveId(path?: string): string | undefined {
  // An empty path reports "0" on Live 12.4.3, the same as any path that
  // doesn't resolve — so exists() stays false after set_path "".
  if (path === "") return "0";

  return path?.startsWith("id ")
    ? path.slice(3)
    : path?.replaceAll(/\s+/g, "/");
}

export class LiveAPI {
  _path?: string;
  _id?: string;
  _registered?: RegisteredMockObject;
  /** Keys copied off the registration, so a retarget can take them back off. */
  _copiedKeys: string[] = [];
  get!: Mock;
  set!: Mock;
  call!: Mock;

  get mock(): RegisteredMockObject | undefined {
    return this._registered;
  }

  constructor(path?: string) {
    this._retarget(path);
  }

  /**
   * Point this object at a path and rebind everything derived from it.
   *
   * Construction and retargeting share this. The real LiveAPI rebinds on goto
   * and on a path write, so an object that gets reused instead of rebuilt has
   * to land where a fresh one would — otherwise it keeps answering get/set/call
   * for whatever it used to point at.
   *
   * @param path - Path or "id N" string to point at
   */
  _retarget(path?: string): void {
    // Properties copied for the previous target would shadow the new one's, and
    // outlive a registration that doesn't define them at all.
    for (const key of this._copiedKeys) {
      delete (this as unknown as Record<string, unknown>)[key];
    }

    this._copiedKeys = [];
    this._path = path;
    this._id = deriveId(path);

    this._registered = lookupMockObject(this._id, this._path);

    if (this._registered) {
      this.get = this._registered.get;
      this.set = this._registered.set;
      this.call = this._registered.call;

      // Copy registered properties onto the instance so they can be accessed directly
      // (e.g., .category, .trackIndex instead of .get("category")[0])
      // Use defineProperty to override extension getters
      for (const [key, value] of Object.entries(this._registered.properties)) {
        // Preserve core LiveAPI getters/setters.
        if (key === "id" || key === "path" || key === "type") {
          continue;
        }

        Object.defineProperty(this, key, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        this._copiedKeys.push(key);
      }
    } else {
      // Use getters (this.type/this.path) so defaults stay correct after goto
      this.get = vi.fn().mockImplementation((prop: string) => {
        // Unknown/unregistered props return [] (→ getProperty() yields
        // undefined), mirroring real Live under noUncheckedIndexedAccess.
        // A [0] default silently passed under-specified tests that forgot to
        // register a backing property. See mock-registry.createGetMock.
        return getPropertyByType(this.type, prop, this.path) ?? [];
      }) as Mock;
      this.set = vi.fn() as Mock;
      this.call = vi.fn().mockImplementation((method: string) => {
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
  }

  /**
   * Create LiveAPI from id or path
   * @param idOrPath - ID or path
   * @returns LiveAPI instance
   */
  static from(idOrPath: string | string[] | number | PathLike): LiveAPI {
    return new LiveAPI(parseIdOrPath(idOrPath));
  }

  exists(): boolean {
    return this.id !== "id 0" && this.id !== "0";
  }

  /**
   * Get a child LiveAPI by appending sub-path components to this object's path
   * @param name - Sub-path component(s) to append
   * @returns LiveAPI for the child
   */
  child(...name: string[]): LiveAPI {
    return LiveAPI.from(`${this.path} ${name.join(" ")}`);
  }

  get id(): string {
    if (this._registered) return this._registered.id;
    if (isNonExistentByDefault()) return "0";

    return this._id ?? "";
  }

  /**
   * Retarget the object, mirroring the real LiveAPI's writable id. Takes the
   * bare id as a number or a string — the "id N" form points the real object at
   * nothing, so it does the same here.
   */
  set id(value: string | number) {
    const bare = String(value);

    this._retarget(bare.startsWith("id ") ? "" : `id ${bare}`);
  }

  get path(): string {
    if (this._registered) {
      return this._registered.returnPath ?? this._registered.path;
    }

    return this._path ?? "";
  }

  /** Retarget the object, mirroring the real LiveAPI's writable path */
  set path(value: string) {
    this._retarget(value);
  }

  /**
   * Retarget the object, mirroring the real LiveAPI's goto
   * @param path - Path to point at
   */
  goto(path: string): void {
    this._retarget(path);
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

  get type(): LiveObjectType {
    if (this._registered) return this._registered.type;

    return detectTypeFromPath(this.path, this._id);
  }

  // Built-in Max methods with no mock implementation — suites that exercise
  // them stub the prototype themselves. goto used to be one of these; it now
  // retargets for real, because reuse depends on it landing where a fresh
  // object would.
  declare getcount: (name: string) => number;
  declare getstring: (property: string) => string;

  // Extension properties/methods added by live-api-extensions.js at runtime
  // These are stubs for TypeScript - actual implementations come from the extension
  declare trackIndex: number | null;
  declare returnTrackIndex: number | null;
  declare category: "regular" | "return" | "master" | null;
  declare sceneIndex: number | null;
  declare clipSlotIndex: number | null;
  declare takeLaneIndex: number | null;
  declare deviceIndex: number | null;
  declare timeSignature: string | null;
  declare getColor: () => string | null;
  declare setColor: (cssColor: string) => void;
  declare getPropertyList: (property: string) => unknown[];
  declare setProperty: (property: string, value: unknown) => void;
  declare setAll: (properties: Record<string, unknown>) => void;
}

interface TrackOverrides {
  id?: string;
  type?: string;
  name?: string;
  trackIndex?: number;
  color?: string;
  isArmed?: boolean;
  playingSlotIndex?: number;
  firedSlotIndex?: number;
  arrangementClipCount?: number;
  sessionClipCount?: number;
  deviceCount?: number;
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
  playingSlotIndex: 2,
  firedSlotIndex: 3,
  arrangementClipCount: 0,
  sessionClipCount: 0,
  deviceCount: 0,
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
  slot?: string;
  trackIndex?: number;
  name?: string;
  color?: string;
  timeSignature?: string;
  looping?: boolean;
  start?: string;
  end?: string;
  length?: string;
  notes?: string;
  [key: string]: unknown;
}

/**
 * Base clip fields (no includes). Add timing/notes overrides when testing those includes.
 * @param overrides - Properties to override
 * @returns Expected clip object
 */
export const expectedClip = (overrides: ClipOverrides = {}): ClipOverrides => ({
  id: "clip1",
  type: "midi",
  view: "session",
  slot: "2/1",
  name: "Test Clip",
  color: "#3DC300",
  // playing, triggered, recording, overdubbing, muted omitted when false
  ...overrides,
});
