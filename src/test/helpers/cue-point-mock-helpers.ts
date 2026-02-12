// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  type MockObjectHandle,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

interface CuePoint {
  id: string;
  time: number;
  name?: string;
}

interface CuePointMaps {
  cueIds: string[];
  cueTimeMap: Record<string, number>;
  cueNameMap: Record<string, string>;
}

/**
 * Builds cue point lookup maps from a cue points array.
 * @param cuePoints - Cue point definitions
 * @returns Cue point maps
 */
export function buildCuePointMaps(cuePoints: CuePoint[]): CuePointMaps {
  const cueIds = cuePoints.map((c) => c.id);
  const cueTimeMap: Record<string, number> = Object.fromEntries(
    cuePoints.map((c) => [c.id, c.time]),
  );
  const cueNameMap: Record<string, string> = Object.fromEntries(
    cuePoints
      .filter((c) => c.name != null)
      .map((c) => [c.id, c.name as string]),
  );

  return { cueIds, cueTimeMap, cueNameMap };
}

interface SetupCuePointMocksOptions {
  cuePoints: CuePoint[];
  liveSetProps?: Record<string, unknown>;
}

interface SetupCuePointRegistryResult extends CuePointMaps {
  liveSet: MockObjectHandle;
}

/**
 * Registry-based setup for cue point mocks.
 * Registers live_set and each cue point as mock objects instead of using global liveApiGet.
 * @param options - Configuration options
 * @param options.cuePoints - Cue point definitions
 * @param options.liveSetProps - Additional live set properties to mock
 * @returns Live set handle and cue point maps
 */
export function setupCuePointMocksRegistry({
  cuePoints,
  liveSetProps = {},
}: SetupCuePointMocksOptions): SetupCuePointRegistryResult {
  const { cueIds, cueTimeMap, cueNameMap } = buildCuePointMaps(cuePoints);

  const liveSet = registerMockObject("live_set", {
    path: "live_set",
    properties: {
      cue_points: children(...cueIds),
      ...liveSetProps,
    },
  });

  for (const cuePoint of cuePoints) {
    registerMockObject(cuePoint.id, {
      path: `id ${cuePoint.id}`,
      properties: {
        time: cuePoint.time,
        ...(cuePoint.name != null ? { name: cuePoint.name } : {}),
      },
    });
  }

  return { liveSet, cueIds, cueTimeMap, cueNameMap };
}
