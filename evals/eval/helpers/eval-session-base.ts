// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Shared utilities for eval session implementations
 */

import { formatTurnHeader } from "#evals/chat/shared/formatting.ts";
import { isQuietMode } from "./output-config.ts";

/**
 * Log the start of a turn (user message and assistant prompt)
 *
 * @param turnNumber - The current turn number
 * @param message - The user's message
 */
export function logTurnStart(turnNumber: number, message: string): void {
  if (isQuietMode()) return;

  console.log(`\n${formatTurnHeader(turnNumber)}`);
  console.log(`\n[User]\n${message}\n`);
  console.log(`[Assistant]`);
}
