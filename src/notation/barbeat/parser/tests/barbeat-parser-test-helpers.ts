// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolve a ±n offset beat the way the grammar does: base + (num/den)*denom.
 * Mirrors the float arithmetic so toStrictEqual matches bit-for-bit.
 * @param base - The integer beat the offset is applied to
 * @param num - Offset numerator (the n in ±n/den)
 * @param den - Offset denominator
 * @param denom - Whole-note-to-beat scale (defaults to 4, i.e. 4/4)
 * @returns The resolved beat value
 */
export const obeat = (
  base: number,
  num: number,
  den: number,
  denom = 4,
): number => base + (num / den) * denom;
