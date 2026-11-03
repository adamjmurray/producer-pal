// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Test helpers for code that reads the Jev route keys from the environment.
 */

import { vi } from "vitest";
import { JEV_ROUTES } from "../jev-client.ts";

/**
 * Set the three route keys; unlisted ones are blanked.
 *
 * @param keys - Values by env var name
 */
export function stubKeys(keys: Record<string, string> = {}): void {
  for (const { envVar } of Object.values(JEV_ROUTES)) {
    vi.stubEnv(envVar, keys[envVar] ?? "");
  }
}
