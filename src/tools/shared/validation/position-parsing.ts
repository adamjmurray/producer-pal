// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import {
  parseCommaSeparatedIds,
  parseCommaSeparatedIndices,
} from "#src/tools/shared/utils.ts";

export interface SlotPosition {
  trackIndex: number;
  sceneIndex: number;
}

/**
 * Formats a track index and scene index into a slot string
 * @param trackIndex - 0-based track index
 * @param sceneIndex - 0-based scene index
 * @returns Slot string (e.g., "0/3")
 */
export function formatSlot(trackIndex: number, sceneIndex: number): string {
  return `${trackIndex}/${sceneIndex}`;
}

/**
 * Parses a single slot string into track and scene indices
 * @param input - Slot string (e.g., "0/3")
 * @returns Parsed slot position
 */
export function parseSlot(input: string): SlotPosition {
  const parts = input.split("/");

  if (parts.length !== 2) {
    throw new Error(
      `invalid slot "${input}" - expected trackIndex/sceneIndex (e.g., "0/3")`,
    );
  }

  return parseSlotParts(parts[0] as string, parts[1] as string, "slot", input);
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

    return parseSlotParts(
      parts[0] as string,
      parts[1] as string,
      "toSlot",
      entry,
    );
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

// --- Helpers below main exports ---

/**
 * Validate and parse two string parts into a SlotPosition.
 * @param trackPart - String to parse as trackIndex
 * @param scenePart - String to parse as sceneIndex
 * @param label - Label for error messages ("slot" or "toSlot")
 * @param input - Original input string for error messages
 * @returns Parsed slot position
 */
function parseSlotParts(
  trackPart: string,
  scenePart: string,
  label: string,
  input: string,
): SlotPosition {
  const trackIndex = Number.parseInt(trackPart);
  const sceneIndex = Number.parseInt(scenePart);

  if (Number.isNaN(trackIndex) || Number.isNaN(sceneIndex)) {
    throw new Error(
      `invalid ${label} "${input}" - trackIndex and sceneIndex must be integers`,
    );
  }

  if (trackIndex < 0 || sceneIndex < 0) {
    throw new Error(
      `invalid ${label} "${input}" - trackIndex and sceneIndex must be non-negative`,
    );
  }

  return { trackIndex, sceneIndex };
}
