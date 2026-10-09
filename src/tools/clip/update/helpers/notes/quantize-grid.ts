// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Kept apart from note-updates.ts so the tool definition can import the grid
// vocabulary without pulling in the Live API code.

/** Live's own grid spellings: the only ones published for `quantizeGrid`. */
export const QUANTIZE_GRID_VALUES = [
  "1/4",
  "1/8",
  "1/8T",
  "1/8+1/8T",
  "1/16",
  "1/16T",
  "1/16+1/16T",
  "1/32",
] as const;

/** Live's grid spellings mapped to its quantize API integers. */
export const QUANTIZE_GRID: Record<string, number> = {
  "1/4": 1,
  "1/8": 2,
  "1/8T": 3,
  "1/8+1/8T": 4,
  "1/16": 5,
  "1/16T": 6,
  "1/16+1/16T": 7,
  "1/32": 8,
};

/**
 * n/N note-value aliases for quantizeGrid, accepted but not published. Each
 * maps to a native grid with an exact note-value spelling. The mixed grids
 * (1/8+1/8T, 1/16+1/16T) have no single note-value form, so they have none.
 */
export const QUANTIZE_GRID_ALIASES: Record<
  string,
  (typeof QUANTIZE_GRID_VALUES)[number]
> = {
  "n/4": "1/4",
  "n/8": "1/8",
  "n/12": "1/8T",
  "n/16": "1/16",
  "n/24": "1/16T",
  "n/32": "1/32",
};
