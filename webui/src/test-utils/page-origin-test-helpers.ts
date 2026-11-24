// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { vi } from "vitest";

/**
 * Serve the "page" from this origin for the test: stubs `window.location`.
 * Undo with `vi.unstubAllGlobals()`.
 * @param origin - The page's origin
 */
export function servePageAt(origin: string): void {
  const { hostname, port, protocol } = new URL(origin);

  vi.stubGlobal("window", {
    location: { origin, hostname, port, protocol },
  });
}
