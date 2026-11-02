// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

/** C Major's intervals, as Live reports them. */
export const C_MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

/** A Live whose clips have a scale of their own. */
export const LIVE_WITH_CLIP_SCALE = "12.4.15";

/** The last Live whose clips have none. */
export const LIVE_WITHOUT_CLIP_SCALE = "12.4.14";

/** The scale properties of the Live Set or a clip. */
export interface ScaleProps {
  scale_mode: number;
  root_note: number;
  scale_name: string;
  scale_intervals: number[];
}

/**
 * Register the Live Set with a scale.
 * @param props - The scale properties it holds; a scale off by default
 * @param extra - Other properties, like its meter
 */
export function registerSongScale(
  props: Partial<ScaleProps> = {},
  extra: Record<string, unknown> = {},
): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties: {
      scale_mode: 0,
      root_note: 0,
      scale_name: "Major",
      scale_intervals: C_MAJOR_INTERVALS,
      ...props,
      ...extra,
    },
  });
}

/**
 * Register Live itself at a version, and count what asks it.
 * @param version - What `get_version_string` answers
 * @returns The number of times it was asked, read when called
 */
export function registerLiveVersion(version: string): () => number {
  let asked = 0;

  registerMockObject("live_app", {
    path: "live_app",
    methods: {
      get_version_string: () => {
        asked += 1;

        return version;
      },
    },
  });

  return () => asked;
}
