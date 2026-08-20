// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/* eslint-disable @stylistic/padding-line-between-statements -- switch fallthrough patterns */
/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic property handling requires any */
import { errorMessage } from "#src/shared/error-utils.ts";
import { type PathLike } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { parseIdOrPath } from "./live-api-path-utils.ts";
import { acquirePooledObject, trackLiveApiObject } from "./live-api-release.ts";

/** What `id` reads when the object points at nothing. */
const NONEXISTENT_ID = "0";

/**
 * Point a pooled object at an "id N" target.
 *
 * Assigning the bare id is the only form that retargets. Measured on 12.4.3, a
 * cleared object given 106 came back at "live_set tracks 0 clip_slots 0 clip"
 * with the clip's name and length; the same value as "id 106" wipes the object,
 * and goto() ignores it either way.
 *
 * A bad id doesn't throw — it leaves the object wherever it already was, so the
 * write is read back. From a cleared object that's "nowhere", which is the right
 * answer for a bad id and counts as success. Anything else means Live ignored
 * the write and the object still points at the last request's target.
 *
 * @param api - The pooled object, its path already cleared
 * @param id - The target id, no "id " prefix
 * @returns Whether the object now points at that id, or at nothing
 */
function retargetToId(api: LiveAPI, id: string): boolean {
  (api as unknown as { id: string }).id = id;

  return api.id === id || api.id === NONEXISTENT_ID;
}

/**
 * Point a pooled object at a target, or build one when the pool is empty.
 *
 * Construction is what registers a context in MxDCore, and nothing takes that
 * back short of a device reload, so reuse is much cheaper than a fresh object.
 * See live-api-release.ts for what pooling does and doesn't buy.
 *
 * @param target - Path or "id N" string, already normalized
 * @returns A tracked object pointing at the target
 */
function buildOrReuse(target: string): LiveAPI {
  const pooled = acquirePooledObject();

  if (pooled == null) {
    return trackLiveApiObject(new LiveAPI(target));
  }

  // Track before retargeting: an object that throws partway through is off the
  // free list already, and leaving it untracked too would strand what it armed.
  trackLiveApiObject(pooled);

  if (!target.startsWith("id ")) {
    pooled.goto(target);

    return pooled;
  }

  if (retargetToId(pooled, target.slice(3))) {
    return pooled;
  }

  // Only reachable if a non-cleared object reached the free list, which the
  // release guard exists to prevent. Building is what this did before pooling
  // covered id targets, so the fallback is just the old behavior.
  return trackLiveApiObject(new LiveAPI(target));
}

if (typeof LiveAPI !== "undefined") {
  /**
   * Create a LiveAPI instance from an ID or path, automatically handling ID prefixing
   * @param idOrPath - ID number/string, full path, PathLike, or ["id", "123"] array
   * @returns New LiveAPI instance
   */
  LiveAPI.from = function (
    idOrPath: string | number | [string, string | number] | PathLike,
  ): LiveAPI {
    return buildOrReuse(parseIdOrPath(idOrPath));
  };
  LiveAPI.prototype.exists = function (this: LiveAPI): boolean {
    // A nonexistent object reports id "0" (a string) on Live 12.4.3 (v8) —
    // probed for a bad path, a bad nested path, and a bad id. The "id 0" and
    // numeric 0 comparisons below have never been observed to fire; they are
    // kept as cheap insurance against other Live versions, not because either
    // form is known to occur. Do not read them as documentation that `id` can
    // be a number: see the contract on `id` in src/types/live-api.d.ts.
    //
    // Don't replace this with the LiveAPI `valid` field, obvious as that looks.
    // Measured on 12.4.3, it reads 1 for a bad path, a bad index, a bad id, and
    // a path cleared to "" — it describes the wrapper, not the target.
    const id = this.id as string | number;

    return id !== "id 0" && id !== NONEXISTENT_ID && id !== 0;
  };

  /**
   * Get a child object as a LiveAPI instance by appending a sub-path to this
   * object's runtime path. Use this instead of `LiveAPI.from(api.path + " name")`.
   * @param name - Sub-path component(s) to append (e.g., "mixer_device", "panning")
   * @returns LiveAPI for the child object
   */
  LiveAPI.prototype.child = function (
    this: LiveAPI,
    ...name: string[]
  ): LiveAPI {
    return LiveAPI.from(`${this.path} ${name.join(" ")}`);
  };

  /**
   * Get a Live API property value with type-appropriate handling
   * @param property - Property name to get
   * @returns Property value
   */
  LiveAPI.prototype.getProperty = function (
    this: LiveAPI,
    property: string,
  ): unknown {
    switch (property) {
      case "scale_intervals":
      case "available_warp_modes":
        return this.get(property);
      case "available_input_routing_channels":
      case "available_input_routing_types":
      case "available_output_routing_channels":
      case "available_output_routing_types":
      case "input_routing_channel":
      case "input_routing_type":
      case "output_routing_channel":
      case "output_routing_type": {
        const rawValue = this.get(property);
        if (Array.isArray(rawValue) && rawValue[0]) {
          try {
            const parsed = JSON.parse(rawValue[0] as string);

            return parsed[property];
          } catch (error) {
            console.warn(
              `LiveAPI getProperty: failed to parse "${property}" response ${JSON.stringify(rawValue[0])}: ${errorMessage(error)}`,
            );
            return null;
          }
        }

        return null;
      }
      default: {
        // get() returns the number 1, not an array, when there is no object.
        // Array.isArray is what keeps that sentinel from reaching callers as a
        // value. See the note on get() in src/types/live-api.d.ts.
        const result = this.get(property);
        return Array.isArray(result) ? result[0] : undefined;
      }
    }
  };

  /**
   * Get a Live API list-valued property as a full array. Unlike getProperty,
   * which unwraps to the first element for scalar ergonomics, this returns the
   * entire array — use for list properties (e.g. wavetable catalogs, IR lists).
   * @param property - Property name to get
   * @returns The property value as an array (empty when unset)
   */
  LiveAPI.prototype.getPropertyList = function (
    this: LiveAPI,
    property: string,
  ): unknown[] {
    // Not defensive coding: get() returns the number 1 when there is no
    // object, so this is the check that turns "no object" into an empty list.
    const result = this.get(property);

    return Array.isArray(result) ? result : [];
  };

  /**
   * Set a Live API property with type-appropriate handling
   * @param property - Property name to set
   * @param value - Property value to set
   * @returns void
   */
  LiveAPI.prototype.setProperty = function (
    this: LiveAPI,
    property: string,
    value: unknown,
  ): void {
    const val = value as any;

    switch (property) {
      case "input_routing_type":
      case "input_routing_channel":
      case "output_routing_type":
      case "output_routing_channel": {
        // Convert value to JSON format expected by Live API
        const jsonValue = JSON.stringify({ [property]: val });
        this.set(property, jsonValue);
        return;
      }
      case "selected_track":
      case "selected_scene":
      case "detail_clip":
      case "highlighted_clip_slot": {
        // Properties that expect "id X" format - automatically format IDs
        const formattedValue =
          typeof val === "string" && !val.startsWith("id ") && /^\d+$/.test(val)
            ? `id ${val}`
            : val;
        this.set(property, formattedValue);
        return;
      }
      default:
        // For all other properties, use regular set
        this.set(property, val);
    }
  };

  /**
   * Get child object IDs for a named collection
   * @param name - Collection name to query
   * @returns Array of child IDs in "id X" format
   */
  LiveAPI.prototype.getChildIds = function (
    this: LiveAPI,
    name: string,
  ): string[] {
    const idArray = this.get(name);

    // get() returns the number 1 when there is no object, so this is what makes
    // a missing collection read as empty rather than throwing.
    if (!Array.isArray(idArray)) {
      return [];
    }

    const children: string[] = [];
    for (let i = 0; i < idArray.length; i += 2) {
      if (idArray[i] === "id") {
        children.push(`id ${String(idArray[i + 1])}`);
      }
    }
    return children;
  };

  /**
   * Get child LiveAPI instances for a named collection
   * @param name - Collection name to query
   * @returns Array of child LiveAPI instances
   */
  LiveAPI.prototype.getChildren = function (
    this: LiveAPI,
    name: string,
  ): LiveAPI[] {
    return this.getChildIds(name).map((id) => buildOrReuse(id));
  };

  LiveAPI.prototype.getColor = function (this: LiveAPI): string | null {
    const colorValue = this.getProperty("color") as number | undefined;
    if (colorValue == null) {
      return null;
    }

    const r = (colorValue >> 16) & 0xff;
    const g = (colorValue >> 8) & 0xff;
    const b = colorValue & 0xff;

    return (
      "#" +
      r.toString(16).padStart(2, "0").toUpperCase() +
      g.toString(16).padStart(2, "0").toUpperCase() +
      b.toString(16).padStart(2, "0").toUpperCase()
    );
  };

  /**
   * Set color from CSS hex format
   * @param cssColor - Color in "#RRGGBB" format
   */
  LiveAPI.prototype.setColor = function (
    this: LiveAPI,
    cssColor: string,
  ): void {
    if (!cssColor.startsWith("#") || cssColor.length !== 7) {
      throw new Error(`Invalid color format: must be "#RRGGBB"`);
    }

    // Parse hex values to RGB
    const r = Number.parseInt(cssColor.substring(1, 3), 16);
    const g = Number.parseInt(cssColor.substring(3, 5), 16);
    const b = Number.parseInt(cssColor.substring(5, 7), 16);

    // Check for NaN values from invalid hex
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      throw new Error(`Invalid hex values in color: ${cssColor}`);
    }

    // Set in Live's color format (0x00RRGGBB)
    this.set("color", (r << 16) | (g << 8) | b);
  };

  /**
   * Set multiple properties at once
   * @param properties - Properties to set
   */
  LiveAPI.prototype.setAll = function (
    this: LiveAPI,
    properties: Record<string, unknown>,
  ): void {
    for (const [property, value] of Object.entries(properties)) {
      if (value != null) {
        if (property === "color") {
          this.setColor(value as string);
        } else {
          this.set(property, value);
        }
      }
    }
  };

  // Index extraction getters (only define if not already defined)
  if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "trackIndex")) {
    Object.defineProperty(LiveAPI.prototype, "trackIndex", {
      get: function (this: LiveAPI) {
        const match = this.path.match(/live_set tracks (\d+)/);
        return match ? Number(match[1]) : null;
      },
    });
  }

  // Return track index extension
  if (
    !Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "returnTrackIndex")
  ) {
    Object.defineProperty(LiveAPI.prototype, "returnTrackIndex", {
      get: function (this: LiveAPI) {
        const match = this.path.match(/live_set return_tracks (\d+)/);
        return match ? Number(match[1]) : null;
      },
    });
  }

  // Track category extension
  if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "category")) {
    Object.defineProperty(LiveAPI.prototype, "category", {
      get: function (this: LiveAPI) {
        if (this.path.includes("live_set tracks")) {
          return "regular";
        } else if (this.path.includes("live_set return_tracks")) {
          return "return";
        } else if (this.path.includes("live_set master_track")) {
          return "master";
        }
        return null;
      },
    });
  }

  if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "sceneIndex")) {
    Object.defineProperty(LiveAPI.prototype, "sceneIndex", {
      get: function (this: LiveAPI) {
        // Try scene path first
        let match = this.path.match(/live_set scenes (\d+)/);
        if (match) {
          return Number(match[1]);
        }

        // Also try clip_slots path (scene index is the clip slot index in session view)
        match = this.path.match(/live_set tracks \d+ clip_slots (\d+)/);
        return match ? Number(match[1]) : null;
      },
    });
  }

  if (
    !Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "clipSlotIndex")
  ) {
    Object.defineProperty(LiveAPI.prototype, "clipSlotIndex", {
      get: function (this: LiveAPI) {
        // Try clip_slots path first
        let match = this.path.match(/live_set tracks \d+ clip_slots (\d+)/);
        if (match) {
          return Number(match[1]);
        }

        // Also try scene path (clip slot index is the scene index in session view)
        match = this.path.match(/live_set scenes (\d+)/);
        return match ? Number(match[1]) : null;
      },
    });
  }

  if (
    !Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "takeLaneIndex")
  ) {
    Object.defineProperty(LiveAPI.prototype, "takeLaneIndex", {
      get: function (this: LiveAPI) {
        const match = this.path.match(/take_lanes (\d+)/);
        return match ? Number(match[1]) : null;
      },
    });
  }

  // Device index extension - matches LAST "devices X" for nested rack support
  if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "deviceIndex")) {
    Object.defineProperty(LiveAPI.prototype, "deviceIndex", {
      get: function (this: LiveAPI) {
        const matches = this.path.match(/devices (\d+)/g);
        if (!matches || matches.length === 0) return null;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length check above guarantees element exists
        const lastMatch = matches.at(-1)!.match(/devices (\d+)/);
        return lastMatch ? Number(lastMatch[1]) : null;
      },
    });
  }

  if (
    !Object.prototype.hasOwnProperty.call(LiveAPI.prototype, "timeSignature")
  ) {
    Object.defineProperty(LiveAPI.prototype, "timeSignature", {
      get: function (this: LiveAPI) {
        // Different Live API object types use different property names for time signature
        const objectType = this.type;
        let numeratorProp, denominatorProp;

        switch (objectType) {
          case "Scene":
            numeratorProp = "time_signature_numerator";
            denominatorProp = "time_signature_denominator";
            break;
          default:
            numeratorProp = "signature_numerator";
            denominatorProp = "signature_denominator";
            break;
        }

        const numerator = this.getProperty(numeratorProp) as number | null;
        const denominator = this.getProperty(denominatorProp) as number | null;

        if (numerator != null && denominator != null) {
          return `${String(numerator)}/${String(denominator)}`;
        }

        return null;
      },
    });
  }
}
