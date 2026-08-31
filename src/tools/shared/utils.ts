// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";

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

// A model writing the word instead of leaving the param out: "null" or
// "undefined" as a param's whole value. (A JSON null never gets this far —
// unsetEmptyParams drops it before the schema coerces.)
const COERCED_NULLISH = new Set(["null", "undefined"]);

/**
 * Whether a param's value names something. Nullish, blank, and the words a
 * caller writes for nothing all mean "unset", so a caller that meant to send
 * nothing is never counted as having sent a value. Silent — use
 * {@link namedParam} to read a published param, which also says so.
 * @param value - Raw param value
 * @returns True when the value names something
 */
export function paramNamesSomething(value: unknown): boolean {
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
 * Reads a published param, dropping a value that names nothing. A blank reads
 * as omitted; a coerced null warns first, since the caller meant to send
 * nothing and the schema turned it into a value. Counting it as sent is how a
 * call gets refused, or a value paired with the wrong object.
 * @param value - Raw param value
 * @param label - Param name, for the warning
 * @returns The trimmed value, or undefined when it names nothing
 */
export function namedParam(
  value: string | null | undefined,
  label: string,
): string | undefined {
  const trimmed = value?.trim();

  if (trimmed == null || trimmed === "") return undefined;

  if (!isCoercedNullish(trimmed)) return trimmed;

  console.warn(`${label} "${trimmed}" names nothing`);

  return undefined;
}

/**
 * Reads a target from the canonical `id` param, falling back to a name the tool
 * still accepts (`clipId`, `ids`, ...). The alias only fills in for a caller
 * that did not send `id`. Both arriving with different values means one was
 * about to be dropped in silence, so say which.
 * @param id - The `id` param
 * @param alias - The alias param
 * @param aliasLabel - The alias's name, for the warnings
 * @returns The trimmed value, or undefined when neither names anything
 */
export function namedIdParam(
  id: string | null | undefined,
  alias: string | null | undefined,
  aliasLabel: string,
): string | undefined {
  return namedAliasedParam(id, "id", alias, aliasLabel);
}

/**
 * Reads a target from the canonical `path` param, falling back to `paths`. Same
 * deal as {@link namedIdParam}: `path` already takes a comma-separated list, so
 * the plural is a guess worth catching rather than dropping.
 * @param path - The `path` param
 * @param paths - The `paths` alias param
 * @returns The trimmed value, or undefined when neither names anything
 */
export function namedPathParam(
  path: string | null | undefined,
  paths: string | null | undefined,
): string | undefined {
  return namedAliasedParam(path, "path", paths, "paths");
}

/**
 * Folds an alias onto the param it stands in for.
 * @param value - The canonical param's value
 * @param canonical - The canonical param's name
 * @param alias - The alias param's value
 * @param aliasLabel - The alias param's name
 * @returns The trimmed value, or undefined when neither names anything
 */
function namedAliasedParam(
  value: string | null | undefined,
  canonical: string,
  alias: string | null | undefined,
  aliasLabel: string,
): string | undefined {
  const named = namedParam(value, canonical);
  const namedAlias = namedParam(alias, aliasLabel);

  if (named == null) return namedAlias;

  if (namedAlias != null && namedAlias !== named) {
    console.warn(
      `${aliasLabel} "${namedAlias}" ignored — "${canonical}" names the target`,
    );
  }

  return named;
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
 * Splits a param read by {@link namedIdParam}/{@link namedPathParam} into its
 * comma-separated entries, warning when every one comes out empty — that state
 * reads exactly like an omitted param unless something says otherwise. An
 * omitted param is nullish by then, and says nothing.
 * @param raw - The param's value, or nullish when it was omitted
 * @param label - Param name, for the warning
 * @returns The trimmed, non-empty entries — empty only when omitted or warned
 */
export function namedCommaSeparatedIds(
  raw: string | null | undefined,
  label: string,
): string[] {
  if (raw == null) return [];

  const entries = parseCommaSeparatedIds(raw);

  if (entries.length === 0) {
    console.warn(`${label} "${raw}" names nothing`);
  }

  reportDroppedEntries(raw, entries, label);

  return entries;
}

/**
 * Warns when splitting a list dropped an empty entry.
 *
 * Only where it matters. A trailing comma drops an entry but moves nothing, and
 * a list where every entry is empty named nothing at all — a different mistake,
 * left to each caller.
 *
 * Says what happened and stops there. Whether it also moved something depends
 * on what the tool reads against the list — names, colors, destinations, or
 * nothing at all — and a shared helper cannot know.
 * @param raw - The param's value, as sent
 * @param entries - What it split into
 * @param label - Param name, for the warning
 */
export function reportDroppedEntries(
  raw: string,
  entries: string[],
  label: string,
): void {
  // Plain scan, not a regex: `id` has no length cap, and anchoring a character
  // class at the end of a long run of separators costs quadratic time.
  const named = raw.split(",");

  while (named.length > 0 && (named.at(-1) ?? "").trim() === "") {
    named.pop();
  }

  if (entries.length >= named.length) return;

  console.warn(`${label} "${raw}" has empty entries, which were dropped`);
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
 * Strips the "id " prefix, giving the bare form a result reports.
 * @param id - ID with or without the prefix (e.g., "id 25" or "25")
 * @returns Bare ID string (e.g., "25")
 */
export function fromLiveApiId(id: string): string {
  return id.startsWith("id ") ? id.slice(3) : id;
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
 * Find the return (track or rack chain) a send refers to, by id or by name.
 *
 * An id wins: it is exact, and unlike a name it can't be shared by two returns
 * or shift when one is renamed. Only these returns' ids count, so a return
 * named after a number stays reachable by name.
 *
 * Otherwise the exact name, then its letter prefix — "A" matches "A-Reverb"
 * (return tracks) and "a Reverb" (rack return chains). Case-insensitive. An
 * exact name anywhere in the list beats a prefix match, so "Delay" finds
 * "Delay", not "Delay 2".
 * @param names - Return names in send order
 * @param sendReturn - Id, name, or letter to match
 * @param ids - Return ids in send order
 * @returns Index of the match, or -1
 */
export function findReturnIndex(
  names: string[],
  sendReturn: string,
  ids: string[] = [],
): number {
  const wanted = sendReturn.toLowerCase();

  // Every name "starts with" the empty string, so without this an empty
  // sendReturn would match the first return that has a separator up front.
  if (wanted === "") {
    return -1;
  }

  const byId = ids.indexOf(sendReturn);
  const exact = names.findIndex((name) => name.toLowerCase() === wanted);

  if (byId !== -1) {
    if (exact !== -1 && exact !== byId) {
      console.warn(
        `sendReturn "${sendReturn}" is the id of "${names[byId]}" and the name of another return; using the id`,
      );
    }

    return byId;
  }

  if (exact !== -1) {
    return exact;
  }

  return names.findIndex((name) => {
    const lower = name.toLowerCase();
    const next = lower[wanted.length];

    return lower.startsWith(wanted) && (next === "-" || next === " ");
  });
}
