// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Test helpers for code that reads the decider API keys from the environment.
 */

import { vi } from "vitest";
import { DECIDER_PROVIDERS } from "../decider-provider.ts";

/**
 * Set the hosted providers' keys; unlisted ones are blanked.
 *
 * @param keys - Values by env var name
 */
export function stubKeys(keys: Record<string, string> = {}): void {
  for (const { envVar } of Object.values(DECIDER_PROVIDERS)) {
    if (envVar != null) {
      vi.stubEnv(envVar, keys[envVar] ?? "");
    }
  }
}
