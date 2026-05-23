// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

interface SetupConnectMocksOptions {
  liveSetName?: string;
  tempo?: number;
  version?: string;
  view?: string;
  liveSetOverrides?: Record<string, unknown>;
}

/**
 * Setup standard mocks for connect tests.
 * @param opts - Configuration options
 * @param opts.liveSetName - Live set name
 * @param opts.tempo - Tempo
 * @param opts.version - Ableton Live version
 * @param opts.view - Focused document view
 * @param opts.liveSetOverrides - Additional LiveSet property overrides
 */
export function setupConnectMocks(opts: SetupConnectMocksOptions = {}): void {
  const {
    liveSetName = "Test Project",
    tempo = 120,
    version = "12.3",
    view = "Session",
    liveSetOverrides = {},
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
      tracks: [],
      return_tracks: [],
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
