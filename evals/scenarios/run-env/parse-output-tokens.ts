// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Parser for the eval CLI's `--output-tokens` option.
 */

import { InvalidArgumentError } from "commander";

/**
 * Parse a max-output-tokens value.
 *
 * @param value - The raw option text
 * @returns The token count
 * @throws InvalidArgumentError when it isn't a positive whole number
 */
export function parseOutputTokens(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new InvalidArgumentError("must be a positive whole number");
  }

  return Number(value);
}
