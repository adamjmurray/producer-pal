// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { select } from "#src/tools/control/select.ts";

// Re-export shared name utilities for backward compatibility
export {
  getNameForIndex,
  parseCommaSeparatedNames,
} from "#src/tools/shared/validation/name-utils.ts";

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
 * Focuses the duplicated item if requested
 * @param focus - Whether to focus
 * @param destination - Destination for duplication
 * @param type - Type of object being duplicated
 * @param createdObjects - Array of created objects from duplication
 */
export function focusIfRequested(
  focus: boolean | undefined,
  destination: string | undefined,
  type: string,
  createdObjects: object[],
): void {
  if (!focus) {
    return;
  }

  const lastObject = createdObjects.at(-1) as { id?: string } | undefined;
  const lastId = lastObject?.id;

  if (type === "clip" && lastId) {
    select({ clipId: lastId, detailView: "clip" });
  } else if (type === "scene" && lastId) {
    select({ view: "session", sceneId: lastId });
  } else {
    const targetView = determineTargetView(destination, type);

    if (targetView) {
      select({ view: targetView });
    }
  }
}
