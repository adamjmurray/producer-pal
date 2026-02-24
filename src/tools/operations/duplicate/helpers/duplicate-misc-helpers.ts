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
