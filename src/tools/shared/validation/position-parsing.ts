// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { targetEntries } from "#src/tools/shared/utils.ts";

export interface ClipSlotPosition {
  trackIndex: number;
  sceneIndex: number;
}

/**
 * Parses a single slot string into track and scene indices
 * @param input - Slot string (e.g., "0/3")
 * @returns Parsed slot position
 */
export function parseSlot(input: string): ClipSlotPosition {
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
 * @param label - The param the caller sent, for messages ("slot", "slots", "toSlot")
 * @returns Array of slot positions
 */
export function parseSlotList(
  input: string | null | undefined,
  label: string,
): ClipSlotPosition[] {
  const entries = targetEntries(input, label);

  return entries.map((entry) => {
    const parts = entry.split("/");

    if (parts.length < 2) {
      throw new Error(
        `invalid ${label} "${entry}" - expected trackIndex/sceneIndex format (e.g., "0/1")`,
      );
    }

    if (parts.length > 2) {
      console.warn(
        `${label} "${entry}" has extra parts, using first two (trackIndex/sceneIndex)`,
      );
    }

    return parseSlotParts(parts[0] as string, parts[1] as string, label, entry);
  });
}

/**
 * Parses a comma-separated string of bar|beat positions into an array
 * @param input - Comma-separated positions (e.g., "1|1" or "1|1,2|1,3|3")
 * @returns Array of bar|beat position strings
 */
export function parseArrangementStartList(input?: string | null): string[] {
  return targetEntries(input, "arrangementStart");
}

// --- Helpers below main exports ---

/**
 * Validate and parse two string parts into a ClipSlotPosition.
 * @param trackPart - String to parse as trackIndex
 * @param scenePart - String to parse as sceneIndex
 * @param label - The param the caller sent, for messages
 * @param input - Original input string for error messages
 * @returns Parsed slot position
 */
function parseSlotParts(
  trackPart: string,
  scenePart: string,
  label: string,
  input: string,
): ClipSlotPosition {
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
