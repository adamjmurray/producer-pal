// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import type { PathLike } from "#src/shared/live-api-path-builders.ts";
import type { LiveObjectType } from "#src/types/live-object-types.ts";

/**
 * Type declarations for Max for Live's LiveAPI class and custom extensions.
 * LiveAPI is a global class available in the Max for Live V8 JavaScript environment.
 */

declare global {
  /**
   * LiveAPI class for interacting with Ableton Live objects.
   * This is a global class in the Max for Live environment.
   */
  class LiveAPI {
    /**
     * Create a LiveAPI instance from a path or ID.
     * @param path - Live Object Model path (e.g., "live_set tracks 0")
     */
    constructor(path: string);

    /**
     * The object ID as a integer string (e.g. "1"), or "0" when the object
     * does not exist. Always a string — never a number, and never the "id X"
     * form the LOM uses in child-id lists. Verified against Live 12.4.3 (v8)
     * for a valid object, a nonexistent path, a nonexistent nested path, and a
     * nonexistent id. Callers may treat this as a string unconditionally;
     * guard on exists() to tell "0" from a real id.
     */
    readonly id: string;

    /**
     * The canonical path of the object, or "" when the object does not exist.
     * Always a string. Verified alongside `id` on Live 12.4.3 (v8).
     *
     * Declared readonly on purpose: Max allows assigning it, but retargeting a
     * live instance is a footgun everywhere except the ppal-live-api tool,
     * which casts this away deliberately.
     */
    readonly path: string;

    /**
     * What the object tracks when the Live Set changes: 0 (the default)
     * follows the path, 1 follows the object the path resolved to.
     */
    mode: number;

    /** The type of the Live object (e.g., "Track", "Clip", "Device") */
    readonly type: LiveObjectType;

    /** Get a property value from the Live object (returns array) */
    get(property: string): unknown[];

    /** Set a property value on the Live object */
    set(property: string, value: unknown): void;

    /** Call a method on the Live object */
    call(method: string, ...args: unknown[]): unknown;

    /** Navigate to a different Live Object Model path */
    goto(path: string): void;

    /** Count the object's children in the named collection */
    getcount(name: string): number;

    /** Get a property value as a string */
    getstring(property: string): string;

    /** Get information about the current object (properties, children, etc.) */
    readonly info: string;

    // ===== Custom extensions from live-api-extensions.js =====

    /**
     * Static factory method to create a LiveAPI instance from various formats.
     * @param idOrPath - ID number/string, full path, PathLike, or ["id", "123"] array
     */
    static from(
      idOrPath: string | number | [string, string | number] | PathLike,
    ): LiveAPI;

    /** Check if this LiveAPI instance points to a valid object */
    exists(): boolean;

    /**
     * Get a child object as a LiveAPI instance by appending sub-path components
     * to this object's runtime path. Prefer this over `LiveAPI.from(api.path + " name")`.
     */
    child(...name: string[]): LiveAPI;

    /**
     * Get a property value, automatically unwrapping single-value arrays.
     * Handles special cases like routing properties and scale intervals.
     */
    getProperty(property: string): unknown;

    /**
     * Get a list-valued property as a full array (not unwrapped to the first
     * element). Use for list properties like wavetable catalogs or IR lists.
     */
    getPropertyList(property: string): unknown[];

    /**
     * Set a property value with automatic formatting for special properties.
     * Handles routing properties (JSON format) and ID properties ("id X" format).
     */
    setProperty(property: string, value: unknown): void;

    /** Get child object IDs as an array of "id X" strings */
    getChildIds(name: string): string[];

    /** Get child objects as LiveAPI instances */
    getChildren(name: string): LiveAPI[];

    /** Get the color as a CSS hex string (e.g., "#FF0000") */
    getColor(): string | null;

    /** Set the color from a CSS hex string (e.g., "#FF0000") */
    setColor(cssColor: string): void;

    /** Set multiple properties at once, skipping null/undefined values */
    setAll(properties: Record<string, unknown>): void;

    // ===== Index extraction getters =====

    /** Extract track index from path (e.g., "live_set tracks 0" -> 0) */
    readonly trackIndex: number | null;

    /** Extract return track index from path */
    readonly returnTrackIndex: number | null;

    /** Get track category: "regular", "return", or "master" */
    readonly category: "regular" | "return" | "master" | null;

    /** Extract scene index from path */
    readonly sceneIndex: number | null;

    /** Extract clip slot index from path */
    readonly clipSlotIndex: number | null;

    /** Extract take lane index from path (0-based), or null if not on a take lane */
    readonly takeLaneIndex: number | null;

    /** Extract device index from path (last device in nested racks) */
    readonly deviceIndex: number | null;

    /** Get time signature as "N/D" string (e.g., "4/4") */
    readonly timeSignature: string | null;
  }
}
