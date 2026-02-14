// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Sets properties on a target object, but only for non-null values
 * @param target - The object to set properties on
 * @param properties - Object with key-value pairs to set
 * @returns The target object (for chaining)
 */
export function setAllNonNull(
  target: Record<string, unknown>,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(properties)) {
    if (value != null) {
      target[key] = value;
    }
  }

  return target;
}

/**
 * Creates a new object with all non-null properties from the input object
 * @param obj - Object with key-value pairs
 * @returns New object containing only non-null properties
 */
export function withoutNulls(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value != null) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Parses a comma-separated string of IDs into an array of trimmed, non-empty strings
 * @param ids - Comma-separated string of IDs (e.g., "1, 2, 3" or "track1,track2")
 * @returns Array of trimmed ID strings
 */
export function parseCommaSeparatedIds(ids?: string | null): string[] {
  if (ids == null) return [];

  return ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Parses a comma-separated string of indices into an array of integers
 * @param indices - Comma-separated string of indices (e.g., "0, 1, 2")
 * @returns Array of integer indices
 * @throws If any index is not a valid integer
 */
export function parseCommaSeparatedIndices(indices?: string | null): number[] {
  if (indices == null) return [];

  return indices
    .split(",")
    .map((index) => index.trim())
    .filter((index) => index.length > 0)
    .map((index) => {
      const parsed = Number.parseInt(index);

      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid index "${index}" - must be a valid integer`);
      }

      return parsed;
    });
}

/**
 * Parses a comma-separated string of values into an array of floats, filtering invalid values
 * @param values - Comma-separated string of numbers (e.g., "1.5, -2, 3.14")
 * @returns Array of valid float values (NaN values are filtered out)
 */
export function parseCommaSeparatedFloats(values?: string | null): number[] {
  if (values == null) return [];

  return values
    .split(",")
    .map((v) => Number.parseFloat(v.trim()))
    .filter((v) => !Number.isNaN(v));
}

/**
 * Builds an indexed name for batch-created items (clips, tracks, etc.)
 * First item keeps base name, subsequent items get numbered suffix.
 * @param baseName - Base name for the item
 * @param count - Total number of items being created
 * @param index - Current item index (0-based)
 * @returns Generated name or undefined if baseName is null
 */
export function buildIndexedName(
  baseName: string | null | undefined,
  count: number,
  index: number,
): string | undefined {
  if (baseName == null) return;
  if (count === 1) return baseName;
  if (index === 0) return baseName;

  return `${baseName} ${index + 1}`;
}

/**
 * Unwraps a single-element array to its element, otherwise returns the array
 * Used for tool results that should return a single object when one item,
 * or an array when multiple items.
 * @param array - Array of results
 * @returns Single element if array has one item, otherwise the full array
 */
export function unwrapSingleResult<T>(array: T[]): T | T[] {
  return array.length === 1 ? (array[0] as T) : array;
}

/**
 * Parses a time signature string into numerator and denominator
 * @param timeSignature - Time signature in format "n/m" (e.g., "4/4", "3/4", "6/8")
 * @returns Object with numerator and denominator
 * @throws If time signature format is invalid
 */
export function parseTimeSignature(timeSignature: string): {
  numerator: number;
  denominator: number;
} {
  const match = timeSignature.match(/^(\d+)\/(\d+)$/);

  if (!match) {
    throw new Error('Time signature must be in format "n/m" (e.g. "4/4")');
  }

  return {
    numerator: Number.parseInt(match[1] as string),
    denominator: Number.parseInt(match[2] as string),
  };
}

/**
 * Converts user-facing view names to Live API view names
 * @param view - View name from user interface ("session" or "arrangement")
 * @returns Live API view name ("Session" or "Arranger")
 * @throws If view name is not recognized
 */
export function toLiveApiView(view: string): string {
  const normalized = view.toLowerCase(); // for added flexibility even though should already be lower case

  switch (normalized) {
    case "session":
      return "Session";
    case "arrangement":
      return "Arranger"; // Live API still uses "Arranger"
    default:
      throw new Error(`Unknown view: ${view}`);
  }
}

/**
 * Converts Live API view names to user-facing view names
 * @param liveApiView - Live API view name ("Session" or "Arranger")
 * @returns User-facing view name ("session" or "arrangement")
 * @throws If view name is not recognized
 */
export function fromLiveApiView(liveApiView: string): string {
  switch (liveApiView) {
    case "Session":
      return "session";
    case "Arranger":
      return "arrangement"; // Live API uses "Arranger" but we use "arrangement"
    default:
      throw new Error(`Unknown Live API view: ${liveApiView}`);
  }
}

/**
 * Asserts a value is defined, throwing if null/undefined. Used for type narrowing.
 * @param value - Value to check
 * @param msg - Error message if undefined
 * @returns The value, narrowed to exclude null/undefined
 */
export function assertDefined<T>(value: T, msg: string): NonNullable<T> {
  if (value == null) {
    throw new Error(`Bug: ${msg}`);
  }

  return value;
}

/**
 * Formats an ID for Live API calls that expect "id X" format.
 * Handles bare numeric IDs, already-prefixed IDs, and number inputs.
 * @param id - ID to format (e.g., "25", "id 25", or 25)
 * @returns Formatted ID string (e.g., "id 25")
 */
export function toLiveApiId(id: string | number): string {
  const s = String(id);

  return s.startsWith("id ") ? s : `id ${s}`;
}
