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

/** A time signature as the tools parse it. */
interface TimeSignatureParts {
  numerator: number;
  denominator: number;
}

/**
 * Read a time signature Live can keep as written. Live rounds a denominator
 * that isn't a power of two to one that is ("4/3" becomes 4/2), which is no
 * time signature the caller asked for, so it is refused before anything is
 * written.
 * @param entry - The time signature, "N/D"
 * @returns The parsed time signature
 * @throws Error when it isn't "N/D" or has a denominator Live can't keep
 */
export function parseKeptTimeSignature(entry: string): TimeSignatureParts {
  const parsed = parseTimeSignature(entry);
  const { denominator } = parsed;

  if ((denominator & (denominator - 1)) !== 0) {
    throw new Error(
      `timeSignature "${entry}" has a denominator Live can't keep; use a power of two (e.g. "4/4", "6/8")`,
    );
  }

  return parsed;
}

/**
 * The time signature Live kept, when it isn't the one written. Live clamps a
 * numerator it can't hold ("100/32" becomes 1/32), so a write is checked once
 * by reading it back.
 * @param asked - The time signature that was written
 * @param numerator - What Live answered for the numerator
 * @param denominator - What Live answered for the denominator
 * @returns The kept "N/D", or undefined when it is as asked or Live didn't say
 */
export function keptTimeSignature(
  asked: TimeSignatureParts,
  numerator: unknown,
  denominator: unknown,
): string | undefined {
  // Nothing came back to compare with, so nothing is claimed about the write.
  if (typeof numerator !== "number" || typeof denominator !== "number") {
    return undefined;
  }

  return numerator === asked.numerator && denominator === asked.denominator
    ? undefined
    : `${numerator}/${denominator}`;
}
