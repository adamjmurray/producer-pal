// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { select } from "#src/tools/control/select.ts";

/**
 * Determines the target view based on destination and type
 * @param destination - Destination for duplication
 * @param type - Type of object being duplicated
 * @returns Target view or null
 */
function determineTargetView(
  destination: string | undefined,
  type: string,
): "session" | "arrangement" | null {
  if (type === "track" || type === "device") {
    return null;
  }

  if (destination === "arrangement") {
    return "arrangement";
  }

  if (destination === "session" || type === "scene") {
    return "session";
  }

  return null;
}

/**
 * Switches to the appropriate view if requested
 * @param switchView - Whether to switch view
 * @param destination - Destination for duplication
 * @param type - Type of object being duplicated
 */
export function switchViewIfRequested(
  switchView: boolean | undefined,
  destination: string | undefined,
  type: string,
): void {
  if (!switchView) {
    return;
  }

  const targetView = determineTargetView(destination, type);

  if (targetView) {
    select({ view: targetView });
  }
}

/**
 * Parse comma-separated string when creating multiple items
 * @param value - Input string that may contain commas
 * @param count - Number of items being created
 * @returns Array of trimmed values, or null if not applicable
 */
export function parseCommaSeparatedNames(
  value: string | undefined,
  count: number,
): string[] | null {
  if (count <= 1 || !value?.includes(",")) {
    return null;
  }

  return value.split(",").map((v) => v.trim());
}

/**
 * Get name for a specific index, using parsed names if available
 * @param baseName - Base name string
 * @param index - Current item index
 * @param parsedNames - Comma-separated names, or null
 * @returns Name for this index, or undefined
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
