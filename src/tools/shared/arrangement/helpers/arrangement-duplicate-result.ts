// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { NONEXISTENT_ID } from "#src/live-api-adapter/live-api-id-or-path.ts";

/**
 * The clip a `duplicate_clip_to_arrangement` call produced.
 *
 * Live answers `["id", n]` when it copies and a bare `1` when it refuses —
 * measured on 12.4.5 for a frozen destination track and for a MIDI/audio
 * mismatch. `1` on its own would build as "id 1", which is Live's Song object,
 * so every `exists()` guard would pass and the Song would flow on as the new
 * clip. A result that doesn't name an object comes back nonexistent instead.
 * @param result - Raw return value from `duplicate_clip_to_arrangement`
 * @returns The new clip, or a nonexistent object when Live refused
 */
export function clipFromDuplicateResult(result: unknown): LiveAPI {
  // A string ("id 549") already names an object, so it passes through — only a
  // bare number needs blocking. `["id", 0]` needs no special case either: it
  // reads as nonexistent already.
  if (typeof result === "string" && result !== "") {
    return LiveAPI.from(result);
  }

  if (Array.isArray(result) && result.length === 2 && result[0] === "id") {
    return LiveAPI.from(result as [string, string | number]);
  }

  return LiveAPI.from(NONEXISTENT_ID);
}
