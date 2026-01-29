/**
 * Shared utilities for eval session implementations
 */

import { isQuietMode } from "./output-config.ts";

/**
 * Log the start of a turn (user message and assistant prompt)
 *
 * @param turnNumber - The current turn number
 * @param message - The user's message
 */
export function logTurnStart(turnNumber: number, message: string): void {
  if (isQuietMode()) return;

  console.log(`\n[Turn ${turnNumber}] User: ${message}`);
  console.log(`[Turn ${turnNumber}] Assistant:`);
}
