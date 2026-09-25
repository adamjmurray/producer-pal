// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";

/** What a result entry says about the color a target ended up with. */
export interface LandedColor {
  /** The color Live settled on, only when it isn't the one asked for */
  color?: string;
  /** Why the color isn't the one asked for, or why that couldn't be checked */
  detail?: string;
}

/**
 * The color a target ended up with, read back after the write. Live keeps a
 * fixed palette and snaps anything else to the nearest entry in it, so the
 * target's own entry reports what landed (ADR-0042).
 * @param object - The track, scene, or clip just written to
 * @param requested - The color the call asked for, as #RRGGBB
 * @returns The entry's `color` and `detail`, empty when it landed as asked
 */
export function landedColor(object: LiveAPI, requested: string): LandedColor {
  let actual: string | null;

  try {
    actual = object.getColor();
  } catch (error) {
    return {
      detail: `color ${requested} was set but could not be read back: ${errorMessage(error)}`,
    };
  }

  // Nothing came back to compare with, so nothing is claimed about the write.
  if (actual == null || actual.toUpperCase() === requested.toUpperCase()) {
    return {};
  }

  return {
    color: actual,
    detail: `color ${requested} is not in Live's palette; landed as ${actual}`,
  };
}
