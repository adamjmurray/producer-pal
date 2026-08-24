// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { focusSelect } from "#src/tools/session/helpers/select-focus-helpers.ts";

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
    focusSelect({ id: lastId, detailView: "clip" });
  } else if (type === "scene" && lastId) {
    focusSelect({ view: "session", id: lastId });
  } else {
    const targetView = determineTargetView(destination, type);

    if (targetView) {
      focusSelect({ view: targetView });
    }
  }
}
