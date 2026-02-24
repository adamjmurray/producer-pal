// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import {
  parseCommaSeparatedIds,
  parseCommaSeparatedIndices,
} from "#src/tools/shared/utils.ts";

interface SlotPosition {
  trackIndex: number;
  sceneIndex: number;
}

/**
 * Parses a comma-separated string of slot positions (trackIndex/sceneIndex format)
 * @param input - Comma-separated slots (e.g., "0/1" or "0/1, 2/3")
 * @returns Array of slot positions
 */
export function parseSlotList(input?: string | null): SlotPosition[] {
  const entries = parseCommaSeparatedIds(input);

  return entries.map((entry) => {
    const parts = entry.split("/");

    if (parts.length < 2) {
      throw new Error(
        `invalid toSlot "${entry}" - expected trackIndex/sceneIndex format (e.g., "0/1")`,
      );
    }

    if (parts.length > 2) {
      console.warn(
        `toSlot "${entry}" has extra parts, using first two (trackIndex/sceneIndex)`,
      );
    }

    const trackIndex = Number.parseInt(parts[0] as string);
    const sceneIndex = Number.parseInt(parts[1] as string);

    if (Number.isNaN(trackIndex) || Number.isNaN(sceneIndex)) {
      throw new Error(
        `invalid toSlot "${entry}" - trackIndex and sceneIndex must be integers`,
      );
    }

    if (trackIndex < 0 || sceneIndex < 0) {
      throw new Error(
        `invalid toSlot "${entry}" - trackIndex and sceneIndex must be non-negative`,
      );
    }

    return { trackIndex, sceneIndex };
  });
}

/**
 * Parses a comma-separated string of scene indices into an array of integers
 * @param input - Comma-separated scene indices (e.g., "0" or "0,2,5")
 * @returns Array of scene indices
 */
export function parseSceneIndexList(input?: string | null): number[] {
  const indices = parseCommaSeparatedIndices(input);

  for (const num of indices) {
    if (num < 0) {
      throw new Error(
        `invalid sceneIndex "${num}" - must be a non-negative integer`,
      );
    }
  }

  return indices;
}

/**
 * Parses a comma-separated string of bar|beat positions into an array
 * @param input - Comma-separated positions (e.g., "1|1" or "1|1,2|1,3|3")
 * @returns Array of bar|beat position strings
 */
export function parseArrangementStartList(input?: string | null): string[] {
  return parseCommaSeparatedIds(input);
}
