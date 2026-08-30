// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
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
  if (baseName == null) return undefined;

  if (parsedNames != null) {
    // Out-of-bounds index returns undefined (noUncheckedIndexedAccess)
    return parsedNames[index];
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

/**
 * Live prepends a return slot's send letter to its name, so writing back the
 * name a read tool reported ("A-Delay", "F Pedal") would double it. Strip a
 * leading letter when it matches the slot's own index.
 * @param path - The slot's Live API path
 * @param name - Requested name
 * @param slotPattern - Regex capturing the slot index at the end of the path
 * @param separator - What Live puts between the letter and the name
 * @returns Name to write
 */
export function stripReturnSlotLetter(
  path: string,
  name: string,
  slotPattern: RegExp,
  separator: string,
): string {
  const match = slotPattern.exec(path);

  if (match == null) {
    return name;
  }

  const index = Number(match[1]);

  // Past Z we don't know what Live labels the slot, so leave the name alone.
  if (index > 25) {
    return name;
  }

  const prefix = `${String.fromCharCode(65 + index)}${separator}`;

  return name.toUpperCase().startsWith(prefix)
    ? name.slice(prefix.length)
    : name;
}
