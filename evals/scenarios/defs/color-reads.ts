// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { argText } from "./arg-text.ts";

/**
 * Whether a "#RRGGBB" reads as red or as blue. Live's palette holds several of
 * each, so an exact value would grade the swatch the model happened to pick.
 * @param color - The color, as "#RRGGBB"
 * @param hue - Which channel has to dominate
 * @returns True when that channel dominates and is bright enough
 */
export function colorReads(color: unknown, hue: "red" | "blue"): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(
    argText(color),
  );

  if (!match) {
    return false;
  }

  const [r, g, b] = match.slice(1).map((hex) => Number.parseInt(hex, 16)) as [
    number,
    number,
    number,
  ];
  const [lead, other] = hue === "red" ? [r, b] : [b, r];

  return lead >= 0x80 && lead > g * 1.5 && lead > other * 1.5;
}
