// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type OfflineDeps } from "../offline/offline-deps.ts";

/**
 * How long adding or updating the device may take in all. A client that gives
 * up at 60 s reports a failure while Live goes on, so every step shares this
 * budget and takes what is left.
 */
export const SETUP_BUDGET_MS = 50_000;

/**
 * @param deps - The clock
 * @returns When a call that starts now must be done, as a `now()` time
 */
export function setupDeadline(deps: Pick<OfflineDeps, "now">): number {
  return deps.now() + SETUP_BUDGET_MS;
}
