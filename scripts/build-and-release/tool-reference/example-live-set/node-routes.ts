// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Canned answers for the Node-side routes the tools reach over node_request:
// Live's browser database and the user-content files under ~/.producer-pal.
// None of that exists while the docs build, so the example Live Set answers for
// it. See live-api.ts for how a request gets here.

/** Route name to the `result` payload the Node side would have returned */
const ROUTE_RESULTS: Record<string, unknown> = {
  "library.search": {
    dbAvailable: true,
    items: [
      {
        name: "Kick Deep 01.wav",
        path: "/Users/example/Music/Ableton/Factory Packs/Kick Deep 01.wav",
        kind: "sample",
        type: "oneshot",
        tags: ["Kick", "Drums"],
        useCount: 12,
        source: "builtin",
        parentFolder: "One Shots",
      },
      {
        name: "Bass Sub.adg",
        path: "/Users/example/Music/Ableton/User Library/Bass Sub.adg",
        kind: "instrument-rack",
        tags: ["Bass"],
        useCount: 3,
        source: "user",
        parentFolder: "Instruments",
      },
    ],
  },

  "globalContext.read": {
    content: "Prefer 8-bar sections. Never overwrite a clip without asking.",
    exists: true,
  },
};

/**
 * Answer a node_request the way the Node side would.
 * @param route - Route name, e.g. "library.search"
 * @returns The JSON body handleNodeResponse expects
 */
export function nodeRouteResponse(route: string): string {
  const result = ROUTE_RESULTS[route];

  if (result === undefined) {
    return JSON.stringify({
      success: false,
      error: `no example response for node route '${route}'`,
    });
  }

  return JSON.stringify({ success: true, result });
}
