// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Opus 5.5 (Anthropic)
// SPDX-License-Identifier: MIT

// The test file must `vi.mock` node-request-v8-protocol.ts for these to work.

import { expect, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

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

/**
 * Write a volume line to clip 123 and expect it refused before any request.
 * @param notation - The line's points
 * @param refusal - What the entry says after `envelope "volume": `
 */
export async function expectVolumeRefused(
  notation: string,
  refusal: string,
): Promise<void> {
  const result = await updateClip({
    id: "123",
    envelopes: `volume: ${notation}`,
  });

  expect(requestNode).not.toHaveBeenCalled();
  expect(result).toStrictEqual(
    expect.objectContaining({
      envelopes: 0,
      detail: `envelope "volume": ${refusal}`,
    }),
  );
}
