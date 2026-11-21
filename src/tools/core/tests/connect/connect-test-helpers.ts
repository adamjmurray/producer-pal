// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

interface SetupConnectMocksOptions {
  liveSetName?: string;
  tempo?: number;
  version?: string;
  view?: string;
  liveSetOverrides?: Record<string, unknown>;
  trackNames?: (string | number)[];
  returnTrackNames?: (string | number)[];
}

/**
 * Setup standard mocks for connect tests.
 * @param opts - Configuration options
 * @param opts.liveSetName - Live set name
 * @param opts.tempo - Tempo
 * @param opts.version - Ableton Live version
 * @param opts.view - Focused document view
 * @param opts.liveSetOverrides - Additional LiveSet property overrides
 * @param opts.trackNames - Registers one named regular track per entry
 * @param opts.returnTrackNames - Registers one named return track per entry
 */
export function setupConnectMocks(opts: SetupConnectMocksOptions = {}): void {
  const {
    liveSetName = "Test Project",
    tempo = 120,
    version = "12.3",
    view = "Session",
    liveSetOverrides = {},
    trackNames = [],
    returnTrackNames = [],
  } = opts;

  registerMockObject("live_set", {
    path: livePath.liveSet,
    type: "Song",
    properties: {
      name: liveSetName,
      tempo,
      signature_numerator: 4,
      signature_denominator: 4,
      is_playing: 0,
      tracks: children(...trackNames.map((_, i) => `track${i}`)),
      return_tracks: children(...returnTrackNames.map((_, i) => `return${i}`)),
      scenes: [],
      ...liveSetOverrides,
    },
  });

  registerMockObject("live_app", {
    path: "live_app",
    type: "Application",
    methods: {
      get_version_string: () => version,
    },
  });

  registerMockObject("app_view", {
    path: "live_app view",
    type: "Application.View",
    properties: {
      focused_document_view: view,
    },
  });

  for (const [index, name] of trackNames.entries()) {
    registerMockObject(`track${index}`, {
      path: livePath.track(index),
      type: "Track",
      properties: { name },
    });
  }

  for (const [index, name] of returnTrackNames.entries()) {
    registerMockObject(`return${index}`, {
      path: livePath.returnTrack(index),
      type: "Track",
      properties: { name },
    });
  }

  const trackIds = extractChildIds(
    (liveSetOverrides.tracks as unknown[] | undefined) ?? [],
  );

  for (const [index, trackId] of trackIds.entries()) {
    registerMockObject(trackId, {
      path: livePath.track(index),
      type: "Track",
    });
  }
}

function extractChildIds(childArray: unknown[]): string[] {
  if (!Array.isArray(childArray)) {
    return [];
  }

  const ids: string[] = [];

  for (let i = 0; i < childArray.length; i += 2) {
    if (childArray[i] === "id") {
      ids.push(String(childArray[i + 1]));
    }
  }

  return ids;
}
