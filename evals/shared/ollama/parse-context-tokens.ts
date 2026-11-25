// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { InvalidArgumentError } from "commander";

/**
 * Parse a `--context` value.
 *
 * @param value - The raw option text
 * @returns The context size in tokens
 * @throws InvalidArgumentError when it isn't a positive whole number (so `64k` is refused)
 */
export function parseContextTokens(value: string): number {
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1
  ) {
    throw new InvalidArgumentError(
      "must be a positive whole number of tokens, e.g. 65536",
    );
  }

  return Number(value);
}
