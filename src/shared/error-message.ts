// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Extract error message from an unknown caught error.
 * In strict mode, caught errors are typed as `unknown`.
 * @param err - The caught error
 * @returns The error message
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Asserts a value is defined, throwing if null/undefined. Used for type narrowing.
 * @param value - Value to check
 * @param msg - Error message if undefined
 * @returns The value, narrowed to exclude null/undefined
 */
export function assertDefined<T>(value: T, msg: string): NonNullable<T> {
  if (value == null) {
    throw new Error(`Bug: ${msg}`);
  }

  return value;
}
