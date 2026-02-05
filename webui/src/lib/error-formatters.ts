// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Normalizes an error into a string message with "Error:" prefix
 * @param {unknown} error - Error object or message
 * @returns {string} Normalized error string with "Error:" prefix
 */
export function normalizeErrorMessage(error: unknown): string {
  console.error(error);
  let errorMessage = String(error);

  if (!errorMessage.startsWith("Error")) {
    errorMessage = `Error: ${errorMessage}`;
  }

  return errorMessage;
}
