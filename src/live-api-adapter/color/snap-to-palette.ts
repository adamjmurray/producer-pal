// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { LIVE_PALETTE } from "#src/live-api-adapter/color/live-palette.ts";

type Lab = readonly [number, number, number];

// Below this OKLab chroma a color reads as gray. A near-gray request only
// snaps to a gray entry, not a faintly tinted one that happens to be close.
const GRAY_CHROMA = 0.02;

/**
 * The palette entry closest to a color as the eye sees it. Live snaps any other
 * color by raw RGB distance, which picks odd entries (a purple landed on a
 * pink-red), so we choose the entry and write it, leaving Live nothing to snap.
 * Plain OKLab distance, not tuned: pink #FFC0CB lands on the pale #E5DCE1, not
 * the rose #FF94A6.
 * @param hex - The color, as #RRGGBB
 * @returns The nearest palette entry, as upper-case #RRGGBB
 */
export function snapToPalette(hex: string): string {
  const target = toOklab(hex);
  const wantGray = chroma(target) < GRAY_CHROMA;
  let best = LIVE_PALETTE[0] as string;
  let bestDistance = Infinity;

  for (const [i, entry] of LIVE_PALETTE.entries()) {
    const lab = paletteLab()[i] as Lab;

    if (wantGray && chroma(lab) >= GRAY_CHROMA) {
      continue;
    }

    const distance = distanceSquared(target, lab);

    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }

  return best;
}

let paletteLabCache: Lab[] | undefined;

/**
 * The palette in OKLab, in palette order.
 * @returns One OKLab triple per entry
 */
function paletteLab(): Lab[] {
  paletteLabCache ??= LIVE_PALETTE.map(toOklab);

  return paletteLabCache;
}

/**
 * How colorful an OKLab color is.
 * @param lab - The color
 * @returns Distance from the gray axis
 */
function chroma(lab: Lab): number {
  return Math.hypot(lab[1], lab[2]);
}

/**
 * Squared distance between two OKLab colors.
 * @param a - First color
 * @param b - Second color
 * @returns The squared Euclidean distance
 */
function distanceSquared(a: Lab, b: Lab): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * Convert #RRGGBB (sRGB) to OKLab.
 * @param hex - The color, as #RRGGBB
 * @returns Lightness, then the two color axes
 */
function toOklab(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map((start) =>
    toLinear(Number.parseInt(hex.slice(start, start + 2), 16) / 255),
  ) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * Undo the sRGB curve for one channel.
 * @param channel - Channel value from 0 to 1
 * @returns The linear-light value
 */
function toLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}
