// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Grid in beats when swing() is given none: half the meter's beat.
export const DEFAULT_SWING_GRID = 0.5;

/**
 * The refusal for a swing amount that moves an off-beat note onto or past the
 * next on-beat, which is never swing. The amount is a delay in beats, so a model
 * that thinks in MPC percent (`swing(0.56)`) lands here; when the amount looks
 * like a percent, the message gives the delay for it.
 * @param amount - Delay in beats
 * @param grid - Swing grid in beats
 * @returns The message, or undefined when the amount is fine
 */
export function swingAmountError(
  amount: number,
  grid: number,
): string | undefined {
  if (Math.abs(amount) < grid) {
    return undefined;
  }

  const message = `swing amount is a delay in beats and must be under the grid (${grid} beats)`;
  const percent = amount >= 50 ? amount : amount * 100;

  if (percent < 50 || percent > 75) {
    return message;
  }

  // MPC swing S puts the off-beat at S of the two-grid pair: delay is
  // (S - 50%) of the pair length.
  const delay = Number((((percent - 50) / 100) * 2 * grid).toFixed(4));

  return `${message}; for ${Number(percent.toFixed(2))}% swing, use ${delay}`;
}
