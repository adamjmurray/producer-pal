// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { select } from "#src/tools/control/select.ts";

/**
 * Generates a name for a duplicated object
 * @param baseName - Base name for the object
 * @param count - Total number of duplicates
 * @param index - Current duplicate index
 * @returns Generated name or undefined
 */
export function generateObjectName(
  baseName: string | undefined,
  count: number,
  index: number,
): string | undefined {
  if (baseName == null) {
    return;
  }

  if (count === 1) {
    return baseName;
  }

  if (index === 0) {
    return baseName;
  }

  return `${baseName} ${index + 1}`;
}

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
  if (destination === "arrangement") {
    return "arrangement";
  }

  if (destination === "session" || type === "track" || type === "scene") {
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
