// Producer Pal
// Copyright (C) 2026 Adam Murray
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
