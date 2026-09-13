// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/* eslint-disable @stylistic/padding-line-between-statements -- switch fallthrough patterns */
/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic property handling requires any */
import { errorMessage } from "#src/shared/error-message.ts";
import { type PathLike } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { buildOrReuse } from "./live-api-build.ts";
import { NONEXISTENT_ID, parseIdOrPath } from "./live-api-id-or-path.ts";

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
    // A nonexistent object reports id "0" (a string) on Live 12.4.3. The other
    // two comparisons have never been seen to fire — cheap insurance for other
    // Live versions, not documentation that `id` can be a number (see the
    // contract on `id` in src/types/live-api.d.ts).
    //
    // Don't replace this with the LiveAPI `valid` field, obvious as that looks.
    // On 12.4.3 it reads 1 for a bad path, index, id, and a cleared path — it
    // describes the wrapper, not the target.
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

  /**
   * Count a collection without building it. Use this instead of
   * `getChildren(name).length`, which builds every child to read one number.
   * @param name - Collection name to query
   * @returns Number of children
   */
  LiveAPI.prototype.getChildCount = function (
    this: LiveAPI,
    name: string,
  ): number {
    return this.getChildIds(name).length;
  };

  /**
   * Get one child of a collection, building only that one.
   * @param name - Collection name to query
   * @param index - Child index
   * @returns The child, or null when the index is out of range
   */
  LiveAPI.prototype.getChildAt = function (
    this: LiveAPI,
    name: string,
    index: number,
  ): LiveAPI | null {
    const id = this.getChildIds(name)[index];

    return id == null ? null : buildOrReuse(id);
  };

  /**
   * Whether any child passes a test, building children one at a time and
   * stopping at the first pass. `getChildren(name).some(...)` builds the whole
   * collection first, however early the answer is known.
   * @param name - Collection name to query
   * @param predicate - Test run against each child in order
   * @returns True as soon as a child passes
   */
  LiveAPI.prototype.someChild = function (
    this: LiveAPI,
    name: string,
    predicate: (child: LiveAPI) => boolean,
  ): boolean {
    for (const id of this.getChildIds(name)) {
      if (predicate(buildOrReuse(id))) {
        return true;
      }
    }

    return false;
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
   * Get the object's name as a string. Live hands back an all-digit name
   * (e.g. a locator, chain, or track named "5678") as a number, not a
   * string — this normalizes that, and reports "" instead of "undefined"
   * for an object with no name property.
   * @returns The name, always a string
   */
  LiveAPI.prototype.getName = function (this: LiveAPI): string {
    const raw = this.getProperty("name") as string | number | undefined;

    return String(raw ?? "");
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

  defineGetter("trackIndex", function (this: LiveAPI) {
    return pathIndex(this.path, /live_set tracks (\d+)/);
  });

  defineGetter("returnTrackIndex", function (this: LiveAPI) {
    return pathIndex(this.path, /live_set return_tracks (\d+)/);
  });

  defineGetter("category", function (this: LiveAPI) {
    if (this.path.includes("live_set tracks")) {
      return "regular";
    } else if (this.path.includes("live_set return_tracks")) {
      return "return";
    } else if (this.path.includes("live_set master_track")) {
      return "master";
    }
    return null;
  });

  // In session view a scene index and a clip slot index are the same number, so
  // each getter answers from whichever path spelling it is given.
  defineGetter("sceneIndex", function (this: LiveAPI) {
    return pathIndex(
      this.path,
      /live_set scenes (\d+)/,
      /live_set tracks \d+ clip_slots (\d+)/,
    );
  });

  defineGetter("clipSlotIndex", function (this: LiveAPI) {
    return pathIndex(
      this.path,
      /live_set tracks \d+ clip_slots (\d+)/,
      /live_set scenes (\d+)/,
    );
  });

  defineGetter("takeLaneIndex", function (this: LiveAPI) {
    return pathIndex(this.path, /take_lanes (\d+)/);
  });

  // The LAST "devices N", so a device nested in a rack reports its own index.
  defineGetter("deviceIndex", function (this: LiveAPI) {
    const last = [...this.path.matchAll(/devices (\d+)/g)].at(-1);

    return last == null ? null : Number(last[1]);
  });

  defineGetter("timeSignature", function (this: LiveAPI) {
    // Scenes spell the properties differently from everything else.
    const prefix = this.type === "Scene" ? "time_signature" : "signature";
    const numerator = this.getProperty(`${prefix}_numerator`) as number | null;
    const denominator = this.getProperty(`${prefix}_denominator`) as
      | number
      | null;

    if (numerator != null && denominator != null) {
      return `${String(numerator)}/${String(denominator)}`;
    }

    return null;
  });
}

/**
 * Add a getter to LiveAPI.prototype, unless something already defined it.
 * @param name - The property name
 * @param get - Reads the value off the object
 */
function defineGetter(name: string, get: (this: LiveAPI) => unknown): void {
  if (!Object.prototype.hasOwnProperty.call(LiveAPI.prototype, name)) {
    Object.defineProperty(LiveAPI.prototype, name, { get });
  }
}

/**
 * The number the first matching pattern captures in a path.
 * @param path - A Live API path
 * @param patterns - Patterns to try in order, each capturing one index
 * @returns The index, or null when none of them match
 */
function pathIndex(path: string, ...patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = path.match(pattern);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}
