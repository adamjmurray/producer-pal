// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The test file must `vi.mock` node-request-v8-protocol.ts for these to work.

import { vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";

/**
 * Reset the remote script mock so every envelope route call succeeds.
 * @param result - What each route answers
 */
export function answerEnvelopeRoutes(result: unknown = {}): void {
  vi.mocked(requestNode).mockReset();
  vi.mocked(requestNode).mockResolvedValue({
    success: true,
    result: { available: true, result },
  });
}

/**
 * The remote script routes called, in order.
 * @returns The route names
 */
export function envelopeRoutesCalled(): unknown[] {
  return vi.mocked(requestNode).mock.calls.map((call) => call[0]);
}
