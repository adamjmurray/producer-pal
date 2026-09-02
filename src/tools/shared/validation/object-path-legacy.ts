// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What results said before 2.2.0: a bare track index, or trackIndex/sceneIndex.
// Honored with a warning rather than refused — a model pasting back what a
// result told it made a well-founded guess, not a typo.

import * as console from "#src/shared/max/v8-max-console.ts";
import { type ObjectPath } from "./object-path.ts";

const LEGACY_TRACK = /^(\d+)$/;
const LEGACY_SLOT = /^(\d+)\/(\d+)$/;

/**
 * Reads a pre-2.2.0 slot or bare track index, warning to teach the spelling
 * that replaced it.
 * @param input - The trimmed path
 * @param label - Param name for error messages
 * @returns What the legacy value names, or null when it isn't one
 */
export function parseLegacyPath(
  input: string,
  label: string,
): ObjectPath | null {
  const slot = LEGACY_SLOT.exec(input);

  if (slot) {
    const trackIndex = Number(slot[1]);
    const sceneIndex = Number(slot[2]);

    console.warn(
      `${label} "${input}" is the old slot spelling; use "t${trackIndex}/s${sceneIndex}"`,
    );

    return { kind: "slot", trackIndex, sceneIndex };
  }

  const track = LEGACY_TRACK.exec(input);

  if (track) {
    const trackIndex = Number(track[1]);

    console.warn(
      `${label} "${input}" is a bare track index; use "t${trackIndex}"`,
    );

    return { kind: "track", trackIndex };
  }

  return null;
}
