// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared reads for the per-tool build-budget tests, which all ask the same
// question of live-api-build-stats.ts: how much of one call went to a target.

import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";

/**
 * How many objects the call resolved of one target shape.
 * @param shape - Target shape, with indices written as `*`
 * @returns Resolutions of that shape
 */
export function resolves(shape: string): number {
  return (
    liveApiBuildStats().byShape.find(([found]) => found === shape)?.[1] ?? 0
  );
}
