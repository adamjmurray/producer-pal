// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Turn logging, shared by the eval session implementations
 */

import {
  GRAY_PROMPT,
  formatAssistantLabel,
  formatTurnHeader,
  formatUserLabel,
} from "#evals/chat/shared/formatting.ts";
import { isQuietMode } from "./quiet-mode.ts";

/**
 * Log the start of a turn (user message and assistant prompt)
 *
 * @param turnNumber - The current turn number
 * @param message - The user's message
 */
export function logTurnStart(turnNumber: number, message: string): void {
  if (isQuietMode()) {
    return;
  }

  console.log(`\n${formatTurnHeader(turnNumber)}`);
  console.log(`\n${formatUserLabel()}${GRAY_PROMPT}${message}\n`);
  console.log(formatAssistantLabel());
}
