// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
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

// z.coerce.string() hands the handler the literal string "null" for a JSON null
// (and "undefined" for undefined) — a value the caller never typed.
const COERCED_NULLISH = new Set(["null", "undefined"]);

/**
 * Whether a hidden param's value names something. Nullish, blank, and the
 * strings a JSON null coerces into all mean "unset" here, so a caller can stop
 * sending the old param without it counting as sent. Published params get no
 * such pass: "null" is not a track, and reading it as unset is how a value
 * lands somewhere the caller never asked for.
 * @param value - Raw param value
 * @returns True when the value names something
 */
export function hiddenParamNamesSomething(value: unknown): boolean {
  if (value == null) return false;

  if (typeof value !== "string") return true;

  return value.trim() !== "" && !isCoercedNullish(value);
}

/**
 * Whether a param's whole value is only what a JSON null coerced into. Useful
 * where such a value would otherwise count as an entry the caller named.
 * @param value - Raw param value
 * @returns True when the value is "null" or "undefined"
 */
export function isCoercedNullish(value: string): boolean {
  return COERCED_NULLISH.has(value.trim());
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

  const numerator = Number.parseInt(match[1] as string);
  const denominator = Number.parseInt(match[2] as string);

  // Guard against zero: "4/0" matches the format regex but a zero denominator
  // yields NaN/divide-by-zero downstream (beats-per-bar math), and "0/4" is
  // meaningless. The regex already excludes negatives and decimals.
  if (numerator < 1 || denominator < 1) {
    throw new Error(
      `Time signature numerator and denominator must be positive (got "${timeSignature}")`,
    );
  }

  return { numerator, denominator };
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
 * Formats an ID for Live API calls that expect "id X" format.
 * Handles bare numeric IDs, already-prefixed IDs, and number inputs.
 * @param id - ID to format (e.g., "25", "id 25", or 25)
 * @returns Formatted ID string (e.g., "id 25")
 */
export function toLiveApiId(id: string | number): string {
  const s = String(id);

  return s.startsWith("id ") ? s : `id ${s}`;
}

/**
 * Removes specified fields from each object in an array.
 * Used to strip redundant fields from nested results (e.g., clips nested in tracks or scenes).
 * @param items - Array of objects to strip fields from, or undefined
 * @param fields - Field names to delete
 */
export function stripFields(
  items: unknown[] | undefined,
  ...fields: string[]
): void {
  if (!items) return;

  for (const item of items) {
    for (const field of fields) {
      delete (item as Record<string, unknown>)[field];
    }
  }
}

/**
 * Round a pan value to Live's 1% resolution (e.g. "30L"); the raw float
 * carries noise like -0.30000001192092896.
 * @param pan - Raw pan value from -1 to 1
 * @returns Pan rounded to two decimals
 */
export function roundPan(pan: number): number {
  return Math.round(pan * 100) / 100;
}

/**
 * Find the return (track or rack chain) a send name refers to: the exact name,
 * or its letter prefix — "A" matches "A-Reverb" (return tracks) and
 * "a Reverb" (rack return chains). Case-insensitive. An exact name anywhere in
 * the list beats a prefix match, so "Delay" finds "Delay", not "Delay 2".
 * @param names - Return names in send order
 * @param sendReturn - Name or letter to match
 * @returns Index of the match, or -1
 */
export function findReturnIndex(names: string[], sendReturn: string): number {
  const wanted = sendReturn.toLowerCase();

  // Every name "starts with" the empty string, so without this an empty
  // sendReturn would match the first return that has a separator up front.
  if (wanted === "") {
    return -1;
  }

  const exact = names.findIndex((name) => name.toLowerCase() === wanted);

  if (exact !== -1) {
    return exact;
  }

  return names.findIndex((name) => {
    const lower = name.toLowerCase();
    const next = lower[wanted.length];

    return lower.startsWith(wanted) && (next === "-" || next === " ");
  });
}
