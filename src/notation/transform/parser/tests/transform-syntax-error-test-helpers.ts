// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { tryParseTransform } from "#src/notation/transform/transform-evaluator.ts";

/**
 * @param source - Transform string expected to fail
 * @returns The error message it fails with
 */
export function errorFor(source: string): string {
  try {
    tryParseTransform(source, 4, 4);
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error(`expected "${source}" to fail`);
}
