// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
  if (!items) {
    return;
  }

  for (const item of items) {
    for (const field of fields) {
      delete (item as Record<string, unknown>)[field];
    }
  }
}
