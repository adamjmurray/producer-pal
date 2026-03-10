// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { parseCommaSeparatedValues } from "#src/tools/shared/validation/color-utils.ts";

/**
 * Parse comma-separated names when creating/updating multiple items.
 * Only splits when count > 1 and the value contains a comma.
 * @param value - Input string that may contain commas
 * @param count - Number of items being named
 * @returns Array of trimmed name strings, or null if not applicable
 */
export function parseCommaSeparatedNames(
  value: string | undefined,
  count: number,
): string[] | null {
  return parseCommaSeparatedValues(value, count);
}

/**
 * Get name for a specific index when creating/updating multiple items.
 * When parsedNames is provided and the index is beyond the array,
 * returns undefined so excess items keep their default/existing name.
 * @param baseName - Base name string (the raw parameter value)
 * @param index - Current item index
 * @param parsedNames - Comma-separated names array, or null
 * @returns Name for this index, or undefined if not applicable
 */
export function getNameForIndex(
  baseName: string | undefined,
  index: number,
  parsedNames: string[] | null,
): string | undefined {
  if (baseName == null) return;

  if (parsedNames != null) {
    return index < parsedNames.length ? parsedNames[index] : undefined;
  }

  return baseName;
}

/**
 * Parse comma-separated names and warn if too many were provided.
 * Combines parseCommaSeparatedNames + warnExtraNames in one call.
 * @param value - Input string that may contain commas
 * @param count - Number of items being named
 * @param toolName - Tool name for the warning message
 * @returns Array of trimmed name strings, or null if not applicable
 */
export function parseNames(
  value: string | undefined,
  count: number,
  toolName: string,
): string[] | null {
  const parsed = parseCommaSeparatedNames(value, count);

  warnExtraNames(parsed, count, toolName);
  warnFewerNames(parsed, count, toolName);

  return parsed;
}

/**
 * Emit a warning when more names were provided than items to name.
 * @param parsedNames - Parsed name array, or null
 * @param count - Number of items being named
 * @param toolName - Tool name for the warning message
 */
export function warnExtraNames(
  parsedNames: string[] | null,
  count: number,
  toolName: string,
): void {
  if (parsedNames != null && parsedNames.length > count) {
    console.warn(
      `${toolName}: ${parsedNames.length} names provided but only ${count} items — ignoring extra`,
    );
  }
}

/**
 * Emit a warning when fewer names were provided than items to name.
 * @param parsedNames - Parsed name array, or null
 * @param count - Number of items being named
 * @param toolName - Tool name for the warning message
 */
export function warnFewerNames(
  parsedNames: string[] | null,
  count: number,
  toolName: string,
): void {
  if (parsedNames != null && parsedNames.length < count) {
    console.warn(
      `${toolName}: ${parsedNames.length} names provided for ${count} items — extras will keep default names`,
    );
  }
}
