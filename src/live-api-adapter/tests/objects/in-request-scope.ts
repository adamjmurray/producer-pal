// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  beginLiveApiScope,
  endLiveApiScope,
} from "#src/live-api-adapter/live-api-release.ts";

/**
 * Run a function inside a request scope, the way the adapter wraps one call.
 * @param run - What to run
 */
export function inRequestScope(run: () => void): void {
  beginLiveApiScope();

  try {
    run();
  } finally {
    endLiveApiScope();
  }
}
